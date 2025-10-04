import { describe, it, expect, vi } from 'vitest'
import { geocodeLocation, findSpeciesByLocation } from '../conservation-tools'

// Mock fetch for API tests
global.fetch = vi.fn()

describe('conservation-tools', () => {
  describe('geocodeLocation', () => {
    it('should geocode a valid location', async () => {
      const mockResponse = [
        {
          lat: '25.7617',
          lon: '-80.1918',
          display_name: 'Miami, Florida, USA',
        },
      ]

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await geocodeLocation('Miami, Florida')

      expect(result).toEqual({
        lat: 25.7617,
        lng: -80.1918,
        display_name: 'Miami, Florida, USA',
      })
    })

    it('should throw error for invalid location', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      await expect(geocodeLocation('InvalidLocationXYZ123')).rejects.toThrow(
        'Location not found'
      )
    })
  })

  describe('findSpeciesByLocation', () => {
    it('should return species for a valid location', async () => {
      const mockLocation = {
        lat: 25.7617,
        lng: -80.1918,
        display_name: 'Miami, Florida, USA',
      }

      const mockiNatResponse = {
        results: [
          {
            taxon: {
              id: 12345,
              name: 'Florida Panther',
              preferred_common_name: 'Florida Panther',
              default_photo: { medium_url: 'https://example.com/photo.jpg' },
            },
          },
        ],
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockiNatResponse,
      })

      const result = await findSpeciesByLocation(mockLocation)

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
