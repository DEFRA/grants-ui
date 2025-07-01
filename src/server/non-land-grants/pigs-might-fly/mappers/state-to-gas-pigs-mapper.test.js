import { stateToPigsMightFlyGasAnswers } from './state-to-gas-pigs-mapper.js'

describe('stateToPigsMightFlyGasAnswers', () => {
  describe('Default values', () => {
    test('should return default values when state is empty', () => {
      const state = {}
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).toEqual({
        isPigFarmer: false,
        totalPigs: 0,
        pigBreeds: []
      })
    })

    test('should return default values when state is null or undefined', () => {
      const resultNull = stateToPigsMightFlyGasAnswers(null)
      const resultUndefined = stateToPigsMightFlyGasAnswers(undefined)

      const expected = {
        isPigFarmer: false,
        totalPigs: 0,
        pigBreeds: []
      }

      expect(resultNull).toEqual(expected)
      expect(resultUndefined).toEqual(expected)
    })
  })

  describe('Basic properties handling', () => {
    test('should correctly map isPigFarmer when true', () => {
      const state = { isPigFarmer: true }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.isPigFarmer).toBe(true)
    })

    test('should correctly map isPigFarmer when false', () => {
      const state = { isPigFarmer: false }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.isPigFarmer).toBe(false)
    })

    test('should correctly map totalPigs', () => {
      const state = { totalPigs: 100 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.totalPigs).toBe(100)
    })

    test('should correctly map pigBreeds array', () => {
      const pigBreeds = ['Large White', 'British Landrace']
      const state = { pigBreeds }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.pigBreeds).toEqual(pigBreeds)
    })
  })

  describe('Pig count properties handling', () => {
    test('should include whitePigsCount when defined', () => {
      const state = { whitePigsCount: 25 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.whitePigsCount).toBe(25)
    })

    test('should include whitePigsCount when zero', () => {
      const state = { whitePigsCount: 0 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.whitePigsCount).toBe(0)
    })

    test('should not include whitePigsCount when undefined', () => {
      const state = { whitePigsCount: undefined }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).not.toHaveProperty('whitePigsCount')
    })

    test('should include britishLandracePigsCount when defined', () => {
      const state = { britishLandracePigsCount: 15 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.britishLandracePigsCount).toBe(15)
    })

    test('should include britishLandracePigsCount when zero', () => {
      const state = { britishLandracePigsCount: 0 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.britishLandracePigsCount).toBe(0)
    })

    test('should not include britishLandracePigsCount when undefined', () => {
      const state = { britishLandracePigsCount: undefined }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).not.toHaveProperty('britishLandracePigsCount')
    })

    test('should include berkshirePigsCount when defined', () => {
      const state = { berkshirePigsCount: 10 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.berkshirePigsCount).toBe(10)
    })

    test('should include berkshirePigsCount when zero', () => {
      const state = { berkshirePigsCount: 0 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.berkshirePigsCount).toBe(0)
    })

    test('should not include berkshirePigsCount when undefined', () => {
      const state = { berkshirePigsCount: undefined }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).not.toHaveProperty('berkshirePigsCount')
    })

    test('should include otherPigsCount when defined', () => {
      const state = { otherPigsCount: 5 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.otherPigsCount).toBe(5)
    })

    test('should include otherPigsCount when zero', () => {
      const state = { otherPigsCount: 0 }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.otherPigsCount).toBe(0)
    })

    test('should not include otherPigsCount when undefined', () => {
      const state = { otherPigsCount: undefined }
      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).not.toHaveProperty('otherPigsCount')
    })
  })

  describe('Complete state mapping', () => {
    test('should correctly map all properties when present', () => {
      const state = {
        isPigFarmer: true,
        totalPigs: 100,
        pigBreeds: ['Large White', 'British Landrace', 'Berkshire'],
        whitePigsCount: 40,
        britishLandracePigsCount: 30,
        berkshirePigsCount: 20,
        otherPigsCount: 10
      }

      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).toEqual({
        isPigFarmer: true,
        totalPigs: 100,
        pigBreeds: ['Large White', 'British Landrace', 'Berkshire'],
        whitePigsCount: 40,
        britishLandracePigsCount: 30,
        berkshirePigsCount: 20,
        otherPigsCount: 10
      })
    })

    test('should correctly map partial state with some pig counts missing', () => {
      const state = {
        isPigFarmer: true,
        totalPigs: 50,
        pigBreeds: ['Large White'],
        whitePigsCount: 30,
        berkshirePigsCount: 20
      }

      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result).toEqual({
        isPigFarmer: true,
        totalPigs: 50,
        pigBreeds: ['Large White'],
        whitePigsCount: 30,
        berkshirePigsCount: 20
      })
      expect(result).not.toHaveProperty('britishLandracePigsCount')
      expect(result).not.toHaveProperty('otherPigsCount')
    })
  })

  describe('Edge cases', () => {
    test('should handle negative pig counts', () => {
      const state = {
        totalPigs: -5,
        whitePigsCount: -10,
        britishLandracePigsCount: -3
      }

      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.totalPigs).toBe(-5)
      expect(result.whitePigsCount).toBe(-10)
      expect(result.britishLandracePigsCount).toBe(-3)
    })

    test('should handle string values for pig counts', () => {
      const state = {
        totalPigs: '50',
        whitePigsCount: '25'
      }

      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.totalPigs).toBe('50')
      expect(result.whitePigsCount).toBe('25')
    })

    test('should handle falsy values for isPigFarmer', () => {
      const testCases = [
        { isPigFarmer: '' },
        { isPigFarmer: 0 },
        { isPigFarmer: null }
      ]

      testCases.forEach((state) => {
        const result = stateToPigsMightFlyGasAnswers(state)
        expect(result.isPigFarmer).toBe(false)
      })
    })

    test('should handle empty arrays and objects', () => {
      const state = {
        pigBreeds: [],
        totalPigs: 0
      }

      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.pigBreeds).toEqual([])
      expect(result.totalPigs).toBe(0)
    })
  })

  describe('Preserve types', () => {
    test('should preserve original data types', () => {
      const state = {
        isPigFarmer: 'yes',
        totalPigs: 100.5,
        pigBreeds: 'Large White',
        whitePigsCount: 25.7
      }

      const result = stateToPigsMightFlyGasAnswers(state)

      expect(result.isPigFarmer).toBe('yes')
      expect(result.totalPigs).toBe(100.5)
      expect(result.pigBreeds).toBe('Large White')
      expect(result.whitePigsCount).toBe(25.7)
    })
  })
})
