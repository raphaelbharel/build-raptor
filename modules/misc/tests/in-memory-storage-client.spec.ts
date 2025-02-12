import { InMemoryStorageClient, Int } from '../src'
import { storageClientContract } from './storage-client-contract'

describe('in-memory-storage-client', () => {
  storageClientContract(async () => new InMemoryStorageClient())

  describe('byteCoubnt', () => {
    test('returns the total size of all currrently stored objects', async () => {
      const sc = new InMemoryStorageClient()
      expect(sc.byteCount).toEqual(0)

      await sc.putObject('a', 'x')
      const s1 = sc.byteCount
      expect(s1).toBeGreaterThan(0)

      await sc.putObject('b', 'xy')
      const s2 = sc.byteCount
      expect(s2).toBeGreaterThan(s1)
      await sc.putObject('c', 'xyz')
      const s3 = sc.byteCount
      expect(s3).toBeGreaterThan(s2)
    })
    test('when an smaller object overwrites a larger object, the byte count decreases', async () => {
      const sc = new InMemoryStorageClient()
      await sc.putObject('a', 'stuvwxyz')
      const s1 = sc.byteCount
      await sc.putObject('a', 'x')
      const s2 = sc.byteCount
      expect(s2).toBeLessThan(s1)
    })
  })
  test('when a size limit is given, yells if a put operation will lead to the byteCount exceeding that limit', async () => {
    const sc = new InMemoryStorageClient(Int(14))

    await sc.putObject('a', 'p')
    await sc.putObject('b', 'q')
    await sc.putObject('c', 'r')
    await expect(sc.putObject('d', 'stuvwxyz')).rejects.toThrowError('size limit (14 bytes) will be exceeded')
  })
})
