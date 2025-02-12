import { Driver } from 'build-raptor-core-testkit'
import { createNopLogger } from 'logger'

import { YarnRepoProtocol } from '../src/yarn-repo-protocol'

jest.setTimeout(90000)
describe('yarn-repo-protocol.e2e', () => {
  const logger = createNopLogger()
  const testName = () => expect.getState().currentTestName

  test('runs tsc and jest when building and testing (respectively)', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/times-two.ts': 'export function timesTwo(n: number) { return n * 2 }',
      'modules/a/tests/times-two.spec.ts': `
        import {timesTwo} from '../src/times-two'
        test('timesTwo', () => { expect(timesTwo(6)).toEqual(12) })
      `,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('OK', { taskKind: 'test' })
    expect(await run.outputOf('build', 'a')).toEqual(['> a@1.0.0 build', '> tsc -b'])
    expect(await run.outputOf('test', 'a')).toEqual(
      expect.arrayContaining([
        'PASS dist/tests/times-two.spec.js',
        'Test Suites: 1 passed, 1 total',
        'Tests:       1 passed, 1 total',
      ]),
    )
  })
  test('supports the importing of *.json files', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/a.ts': `import * as z from './z.json'; export const a = () => z.z1 + z.z2`,
      'modules/a/src/z.json': { z1: 'foo', z2: 'boo' },
      'modules/a/tests/a.spec.ts': `import {a} from '../src/a'; test('a', () => expect(a()).toEqual('x'))`,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('FAIL', { taskKind: 'test' })
    expect(await run.outputOf('test', 'a')).toEqual(expect.arrayContaining([`    Received: \"fooboo\"`]))
  })
  test('deletes dist/src/*.{js,d.ts} files that do not have a matching *.ts file under src/', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/a.ts': 'export function a() {}',
      'modules/a/tests/a.spec.ts': '//',
    }

    const fork = await driver.repo(recipe).fork()

    const xjs = fork.file('modules/a/dist/src/x.js')
    const xdts = fork.file('modules/a/dist/src/x.d.ts')

    await Promise.all([xjs.write('//'), xdts.write('//')])
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([true, true])
    await fork.run('OK', { taskKind: 'build' })
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([false, false])

    await Promise.all([xjs.write('//'), xdts.write('//')])
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([true, true])
    await fork.run('OK', { taskKind: 'build' })
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([false, false])
  })
  test('does not delete dist/src/*.{js,d.ts} files that have a matching *.tsx file under src/', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/a.tsx': 'export function a() {}',
      'modules/a/tests/a.spec.ts': '//',
    }

    const fork = await driver.repo(recipe).fork()

    const ajs = fork.file('modules/a/dist/src/a.js')
    const adts = fork.file('modules/a/dist/src/a.d.ts')

    await fork.run('OK', { taskKind: 'build' })
    expect(await Promise.all([ajs.exists(), adts.exists()])).toEqual([true, true])
  })
  test('deletes dist/tests/*.{js,d.ts} files that do not have a matching *.ts file under tests/', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/a.ts': 'export function a() {}',
      'modules/a/tests/a.spec.ts': '//',
    }

    const fork = await driver.repo(recipe).fork()

    const xjs = fork.file('modules/a/dist/tests/x.js')
    const xdts = fork.file('modules/a/dist/tests/x.d.ts')

    await Promise.all([xjs.write('//'), xdts.write('//')])
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([true, true])
    await fork.run('OK', { taskKind: 'build' })
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([false, false])

    await Promise.all([xjs.write('//'), xdts.write('//')])
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([true, true])
    await fork.run('OK', { taskKind: 'build' })
    expect(await Promise.all([xjs.exists(), xdts.exists()])).toEqual([false, false])
  })
  test('can run code that imports code from another package', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a', ['b']),
      'modules/a/src/a.ts': `
        import {b} from 'b'
        export function a(n: number) { return b(n)+2 }`,
      'modules/a/tests/a.spec.ts': `
        import {a} from '../src/a'
        test('a', () => { expect(a(7)).toEqual(703) })
      `,
      'modules/b/package.json': driver.packageJson('b'),
      'modules/b/src/index.ts': `export function b(n: number) { return n*100 }`,
      'modules/b/tests/b.spec.ts': `import {b} from '../src'; test('b', () => {expect(b(2)).toEqual(200)})`,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('FAIL', { taskKind: 'test' })

    expect(await run.outputOf('test', 'a')).toEqual(expect.arrayContaining(['    Expected: 703', '    Received: 702']))
  })
  test('publish-assets runs prepare-assets', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a', [], { 'prepare-assets': 'touch prepared-assets/x' }),
      'modules/a/src/a.ts': `export function a(n: number) { return n * 100 }`,
      'modules/a/tests/a.spec.ts': ``,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('OK', { taskKind: 'publish-assets' })

    expect(await run.outputOf('publish-assets', 'a')).toEqual(['> a@1.0.0 prepare-assets', '> touch prepared-assets/x'])
  })
  test('publish-assets runs only in packages which define a prepare-assets run script', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a', [], { 'prepare-assets': 'touch prepared-assets/x' }),
      'modules/a/src/a.ts': `export function a(n: number) { return n * 100 }`,
      'modules/a/tests/a.spec.ts': ``,
      'modules/b/package.json': driver.packageJson('b'),
      'modules/b/src/b.ts': `export function b(n: number) { return n * 200 }`,
      'modules/b/tests/b.spec.ts': ``,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('OK', { taskKind: 'publish-assets' })

    expect(await run.outputOf('publish-assets', 'a')).toEqual(['> a@1.0.0 prepare-assets', '> touch prepared-assets/x'])
    expect(run.taskNames()).toEqual(['a:build', 'a:publish-assets'])
  })
  test('publish-assets publishes a blob', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a', [], { 'prepare-assets': 'echo "a" > prepared-assets/x' }),
      'modules/a/src/a.ts': `export function a(n: number) { return n * 100 }`,
      'modules/a/tests/a.spec.ts': ``,
    }

    const fork = await driver.repo(recipe).fork()
    await fork.run('OK', { taskKind: 'publish-assets' })

    const steps = await fork.getSteps('TASK_STORE_PUT')
    const blobId = steps.find(at => at.taskName === 'a:publish-assets')?.blobId
    expect(await driver.slurpBlob(blobId)).toEqual({ 'prepared-assets/x': 'a\n' })
  })

  test('takes just the current files when publishing an asset', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a', [], { 'prepare-assets': 'echo "a" > prepared-assets/x1' }),
      'modules/a/src/a.ts': `export function a(n: number) { return n * 100 }`,
      'modules/a/tests/a.spec.ts': ``,
    }

    const fork = await driver.repo(recipe).fork()

    const readBlob = async (taskName: string) => {
      const steps = await fork.readStepByStepFile()
      const blobId = steps
        .filter(at => at.taskName === taskName)
        .flatMap(at => (at.step === 'TASK_STORE_GET' || at.step === 'TASK_STORE_PUT' ? [at] : []))
        .find(Boolean)?.blobId
      return await driver.slurpBlob(blobId)
    }

    await fork.run('OK', { taskKind: 'publish-assets' })
    expect(Object.keys(await readBlob('a:publish-assets'))).toEqual(['prepared-assets/x1'])

    await fork
      .file('modules/a/package.json')
      .write(driver.packageJson('a', [], { 'prepare-assets': 'echo "a" > prepared-assets/x2' }))
    await fork.run('OK', { taskKind: 'publish-assets' })
    expect(Object.keys(await readBlob('a:publish-assets'))).toEqual(['prepared-assets/x2'])
  })
  test('when the test fails, the task output includes the failure message prodcued by jest', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/times-two.ts': 'export function timesTwo(n: number) { return n * 2 }',
      'modules/a/tests/times-two.spec.ts': `
        import {timesTwo} from '../src/times-two'
        test('timesTwo', () => { expect(timesTwo(6)).toEqual(-12) })
      `,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('FAIL', { taskKind: 'test' })
    expect(await run.outputOf('build', 'a')).toEqual(['> a@1.0.0 build', '> tsc -b'])
    expect(await run.outputOf('test', 'a')).toEqual(
      expect.arrayContaining([
        'FAIL dist/tests/times-two.spec.js',
        '    Expected: -12',
        '    Received: 12',
        'Tests:       1 failed, 1 total',
      ]),
    )
  })

  test('runs tasks and captures their output', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/a.ts': '// something',
      'modules/a/tests/a.spec.ts': `test('a', () => {expect(1).toEqual(1)}); console.log('the quick BROWN fox'); `,
    }

    const fork = await driver.repo(recipe).fork()

    const run = await fork.run('OK', { taskKind: 'test' })
    expect(await run.outputOf('build', 'a')).toEqual(['> a@1.0.0 build', '> tsc -b'])
    expect(await run.outputOf('test', 'a')).toContain('    the quick BROWN fox')
  })

  test('reruns tests when the source code changes', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/times-two.ts': 'export function timesTwo(n: number) { return n * 3 }',
      'modules/a/tests/times-two.spec.ts': `
        import {timesTwo} from '../src/times-two'
        test('timesTwo', () => { expect(timesTwo(216)).toEqual(432) })
      `,
    }

    const fork = await driver.repo(recipe).fork()

    const runA = await fork.run('FAIL', { taskKind: 'test' })
    expect(runA.getSummary('a', 'build')).toMatchObject({ execution: 'EXECUTED' })
    expect(runA.getSummary('a', 'test')).toMatchObject({ execution: 'EXECUTED' })
    expect(await runA.outputOf('test', 'a')).toContain('    Received: 648')

    await fork.file('modules/a/src/times-two.ts').write('export function timesTwo(n: number) { return n * 2 }')
    const runB = await fork.run('OK', { taskKind: 'test' })
    expect(runA.getSummary('a', 'build')).toMatchObject({ execution: 'EXECUTED' })
    expect(runB.getSummary('a', 'test')).toMatchObject({ execution: 'EXECUTED' })
    expect(await runB.outputOf('test', 'a')).toContain('PASS dist/tests/times-two.spec.js')
  })
  test('if nothing has changed the tasks are cached', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a', ['b']),
      'modules/a/src/a.ts': `
        import {b} from 'b'
        export function a(n: number) { return b(n)+2 }`,
      'modules/a/tests/a.spec.ts': `
        import {a} from '../src/a'
        test('a', () => { expect(a(7)).toEqual(702) })
      `,
      'modules/b/package.json': driver.packageJson('b'),
      'modules/b/src/index.ts': `export function b(n: number) { return n*100 }`,
      'modules/b/tests/b.spec.ts': `import {b} from '../src'; test('b', () => {expect(b(2)).toEqual(200)})`,
    }

    const fork = await driver.repo(recipe).fork()

    const run1 = await fork.run('OK', { taskKind: 'test' })
    expect(await run1.outputOf('test', 'a')).toContain('PASS dist/tests/a.spec.js')
    expect(run1.executionTypeOf('a', 'test')).toEqual('EXECUTED')
    expect(run1.executionTypeOf('b', 'test')).toEqual('EXECUTED')

    const run2 = await fork.run('OK', { taskKind: 'test' })
    expect(await run2.outputOf('test', 'a')).toEqual([])
    expect(run2.executionTypeOf('a', 'test')).toEqual('CACHED')
    expect(run2.executionTypeOf('b', 'test')).toEqual('CACHED')

    const run3 = await fork.run('OK', { taskKind: 'test' })
    expect(await run3.outputOf('test', 'a')).toEqual([])
    expect(run3.executionTypeOf('a', 'test')).toEqual('CACHED')
    expect(run3.executionTypeOf('b', 'test')).toEqual('CACHED')

    const run4 = await fork.run('OK', { taskKind: 'test' })
    expect(await run4.outputOf('test', 'a')).toEqual([])
    expect(run4.executionTypeOf('a', 'test')).toEqual('CACHED')
    expect(run4.executionTypeOf('b', 'test')).toEqual('CACHED')
  })
  test('code is rebuilt when package.json changes', async () => {
    const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
    const recipe = {
      'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
      'modules/a/package.json': driver.packageJson('a'),
      'modules/a/src/a.ts': `export function a(n: number) { return n * 333 }`,
      'modules/a/tests/a.spec.ts': `test('a', () => { expect(1).toEqual(1) })`,
    }

    const fork = await driver.repo(recipe).fork()

    const run1 = await fork.run('OK', { taskKind: 'build' })
    expect(run1.executionTypeOf('a', 'build')).toEqual('EXECUTED')

    const run2 = await fork.run('OK', { taskKind: 'build' })
    expect(run2.executionTypeOf('a', 'build')).toEqual('CACHED')

    fork.file('modules/a/package.json').write(driver.packageJson('a', [], { foo: '# nothing' }))
    const run3 = await fork.run('OK', { taskKind: 'build' })
    expect(run3.executionTypeOf('a', 'build')).toEqual('EXECUTED')
  })
  describe('high definition rerun of tests', () => {
    test('reruns just the tests that did not pass', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a'),
        'modules/a/src/abs.ts': 'export function abs(n: number) { return n }',
        'modules/a/tests/abs.spec.ts': `
          import {abs} from '../src/abs'
          import {writeFileSync} from 'fs'
          test('p', () => { writeFileSync('p', ''); expect(abs(1)).toEqual(1) })
          test('n', () => { writeFileSync('n', ''); expect(abs(-2)).toEqual(2) })
        `,
      }

      const fork = await driver.repo(recipe).fork()

      await fork.run('FAIL', { taskKind: 'test' })
      const p = fork.file('modules/a/p')
      const n = fork.file('modules/a/n')
      expect(await p.exists()).toBe(true)
      expect(await n.exists()).toBe(true)

      await Promise.all([p.rm(), n.rm()])
      await fork.run('FAIL', { taskKind: 'test' })
      expect(await p.exists()).toBe(false)
      expect(await n.exists()).toBe(true)
    })
    test('when the code is changed, all tests run', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })

      const buggyImpl = 'export function abs(n: number) { return n }'
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a'),
        'modules/a/src/abs.ts': buggyImpl,
        'modules/a/tests/abs.spec.ts': `
          import {abs} from '../src/abs'
          import {writeFileSync} from 'fs'
          test('p', () => { writeFileSync('p', ''); expect(abs(1)).toEqual(1) })
          test('n', () => { writeFileSync('n', ''); expect(abs(-2)).toEqual(2) })
        `,
      }

      const fork = await driver.repo(recipe).fork()

      await fork.run('FAIL', { taskKind: 'test' })
      const p = fork.file('modules/a/p')
      const n = fork.file('modules/a/n')
      expect(await p.exists()).toBe(true)
      expect(await n.exists()).toBe(true)

      await Promise.all([p.rm(), n.rm()])
      await fork.run('FAIL', { taskKind: 'test' })
      expect(await p.exists()).toBe(false)
      expect(await n.exists()).toBe(true)

      await Promise.all([p.rm(), n.rm()])
      await fork.file('modules/a/src/abs.ts').write(`export function abs(n: number) { return n < 0 ? -n : n }`)
      await fork.run('OK', { taskKind: 'test' })
      expect(await p.exists()).toBe(true)
      expect(await n.exists()).toBe(true)
    })
    test('when code is reverted, does not run all tests', async () => {
      const buggyImpl = 'export function abs(n: number) { return n }'
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a'),
        'modules/a/src/abs.ts': buggyImpl,
        'modules/a/tests/abs.spec.ts': `
          import {abs} from '../src/abs'
          import {writeFileSync} from 'fs'
          test('p', () => { writeFileSync('p', ''); expect(abs(1)).toEqual(1) })
          test('n', () => { writeFileSync('n', ''); expect(abs(-2)).toEqual(2) })
        `,
      }

      const fork = await driver.repo(recipe).fork()
      const p = fork.file('modules/a/p')
      const n = fork.file('modules/a/n')

      const wipe = async () => await Promise.all([p.rm(), n.rm()])
      const invoked = async () =>
        [(await p.exists()) ? 'P' : '', (await n.exists()) ? 'N' : ''].filter(Boolean).join(',')

      await fork.run('FAIL', { taskKind: 'test' })
      expect(await invoked()).toEqual('P,N')

      await wipe()
      await fork.run('FAIL', { taskKind: 'test' })
      expect(await invoked()).toEqual('N')

      await wipe()
      await fork.file('modules/a/src/abs.ts').write(`export function abs(n: number) { return n < 0 ? -n : n }`)
      await fork.run('OK', { taskKind: 'test' })
      expect(await invoked()).toEqual('P,N')

      await wipe()
      await fork.file('modules/a/src/abs.ts').write(buggyImpl)
      await fork.run('FAIL', { taskKind: 'test' })
      expect(await invoked()).toEqual('N')
    })
    test('when test-caching is false reruns all tests', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a'),
        'modules/a/src/abs.ts': 'export function abs(n: number) { return n }',
        'modules/a/tests/abs.spec.ts': `
          import {abs} from '../src/abs'
          import {writeFileSync} from 'fs'
          test('p', () => { writeFileSync('p', ''); expect(abs(1)).toEqual(1) })
          test('n', () => { writeFileSync('n', ''); expect(abs(-2)).toEqual(2) })
        `,
      }

      const fork = await driver.repo(recipe).fork()
      const p = fork.file('modules/a/p')
      const n = fork.file('modules/a/n')

      const wipe = async () => await Promise.all([p.rm(), n.rm()])
      const invoked = async () =>
        [(await p.exists()) ? 'P' : '', (await n.exists()) ? 'N' : ''].filter(Boolean).join(',')

      await fork.run('FAIL', { taskKind: 'test' })
      expect(await invoked()).toEqual('P,N')

      await wipe()
      await fork.run('FAIL', { taskKind: 'test' })
      expect(await invoked()).toEqual('N')

      await wipe()
      await fork.run('FAIL', { taskKind: 'test', testCaching: false })
      expect(await invoked()).toEqual('P,N')
    })
  })
  describe('validations', () => {
    test('a test tasks runs the "validate" run script and places its output in the tasks output file', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a', [], { validate: 'node dist/tests/a.pqr' }),
        'modules/a/src/a.ts': `export function a(n: number) { return n * 333 }`,
        'modules/a/tests/a.pqr.ts': `console.log("pqr test is running")`,
        'modules/a/tests/a.spec.ts': `test('a', () => { expect(1).toEqual(1) })`,
      }

      const fork = await driver.repo(recipe).fork()

      const run = await fork.run('OK', { taskKind: 'test' })
      expect(run.executionTypeOf('a', 'test')).toEqual('EXECUTED')
      expect(await run.outputOf('test', 'a')).toContain('pqr test is running')
    })
    test('if the validation fails, the task fails', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a', [], { validate: 'node dist/tests/a.pqr' }),
        'modules/a/src/a.ts': `export function a(n: number) { return n * 333 }`,
        'modules/a/tests/a.pqr.ts': `process.exit(1)`,
        'modules/a/tests/a.spec.ts': `test('a', () => { expect(1).toEqual(1) })`,
      }

      const fork = await driver.repo(recipe).fork()

      const run = await fork.run('FAIL', { taskKind: 'test' })
      expect(run.executionTypeOf('a', 'test')).toEqual('EXECUTED')
    })
    test('the output of the "validate" run script is appended to the tasks output file even if validation failed', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a', [], { validate: 'node dist/tests/a.pqr' }),
        'modules/a/src/a.ts': `export function a(n: number) { return n * 333 }`,
        'modules/a/tests/a.pqr.ts': `throw new Error("WE HAVE A PROBLEM")`,
        'modules/a/tests/a.spec.ts': `test('a', () => { expect(1).toEqual(1) })`,
      }

      const fork = await driver.repo(recipe).fork()

      const run = await fork.run('FAIL', { taskKind: 'test' })
      expect(await run.outputOf('test', 'a')).toContain('Error: WE HAVE A PROBLEM')
    })
  })
  describe('test reporting', () => {
    test('publishes test events', async () => {
      const driver = new Driver(testName(), { repoProtocol: new YarnRepoProtocol(logger) })
      const recipe = {
        'package.json': { name: 'foo', private: true, workspaces: ['modules/*'] },
        'modules/a/package.json': driver.packageJson('a'),
        'modules/a/src/a.ts': `//`,
        'modules/a/tests/a.spec.ts': `
          describe('a', () => {
            test('foo', () => { expect(1).toEqual(1) })
            test('bar', () => { expect(1).toEqual(2) })
          })`,
      }

      const fork = await driver.repo(recipe).fork()

      await fork.run('FAIL', { taskKind: 'test' })
      const steps = await fork.readStepByStepFile()
      expect(steps.filter(at => at.step === 'TEST_ENDED')).toEqual([
        expect.objectContaining({
          step: 'TEST_ENDED',
          taskName: 'a:test',
          fileName: 'modules/a/dist/tests/a.spec.js',
          testPath: ['a', 'foo'],
          verdict: 'TEST_PASSED',
        }),
        expect.objectContaining({
          step: 'TEST_ENDED',
          taskName: 'a:test',
          fileName: 'modules/a/dist/tests/a.spec.js',
          testPath: ['a', 'bar'],
          verdict: 'TEST_FAILED',
        }),
      ])
    })
  })
})
