import * as fse from 'fs-extra'
import { aTimeoutOf } from 'misc'
import * as Tmp from 'tmp-promise'

import { createDefaultLogger } from '../src/logger'

async function awaitFor<T>(ms: number, calc: () => Promise<T | undefined>): Promise<T> {
  const t0 = Date.now()
  while (true) {
    const ret = await calc()
    if (ret) {
      return ret
    }
    const dt = Date.now() - t0
    if (dt > ms) {
      throw new Error('timeout')
    }

    await aTimeoutOf(50).hasPassed()
  }
}

async function readContent(path: string, sentinel: string): Promise<string> {
  return await awaitFor(2000, async () => {
    const content = await fse.readFile(path, 'utf8')
    return content.includes(sentinel) ? content : undefined
  })
}

describe('logger', () => {
  test('writes the message to a file', async () => {
    const f = await Tmp.file({})
    const logger = createDefaultLogger(f.path)
    logger.info('foo')

    const content = await readContent(f.path, 'foo')
    expect(content.trim()).toMatch(
      /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z) \[info\] foo/,
    )
  })
  test('can write errors to a file', async () => {
    const f = await Tmp.file({ keep: true })
    const logger = createDefaultLogger(f.path)
    logger.error(`uh-oh`, new Error(`Huston, we have a problem`))

    const content = await readContent(f.path, 'we have a problem')

    const lines = content.split('\n')
    expect(lines[0]).toMatch(/\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z) \[error\] uh-oh/)
    expect(lines[1]).toContain(`${__filename.replace('/dist/', '/').replace(/\.js$/, '.ts')}:44:27`)
  })
  test('by default, does not write debug-level messages to the file', async () => {
    const f = await Tmp.file({})
    const logger = createDefaultLogger(f.path)
    logger.info(`Atlantic`)
    logger.debug(`Pacific`)
    logger.info(`Indian`)
    logger.info('-the end-')

    const content = await readContent(f.path, '-the end-')

    expect(content).toContain(`[info] Atlantic`)
    expect(content).toContain(`[info] Indian`)
    expect(content).not.toContain(`Pacific`)
    expect(content).not.toContain(`[debug]`)
  })
  test('when the log level is set to "debug", does write debug-level messages to the file', async () => {
    const f = await Tmp.file({})
    const logger = createDefaultLogger(f.path, 'debug')
    logger.info(`Atlantic`)
    logger.debug(`Pacific`)
    logger.info(`Indian`)
    logger.info('-the end-')

    const content = await readContent(f.path, '-the end-')

    expect(content).toContain(`[info] Atlantic`)
    expect(content).toContain(`[info] Indian`)
    expect(content).toContain(`[debug] Pacific`)
  })
  test('print() sends messages to the UI stream (in addition to the log file)', async () => {
    const f = await Tmp.file({})
    const ui = await Tmp.file({ keep: true })
    const uiStream = fse.createWriteStream(ui.path)

    const logger = createDefaultLogger(f.path, undefined, uiStream)
    logger.info(`Atlantic`)
    logger.print(`Pacific`)
    logger.info(`Indian`)
    logger.info(`-the end-`)

    const fileContent = await readContent(f.path, '-the end-')
    expect(fileContent).toContain(`[info] Pacific\n`)

    const uiContent = await fse.readFile(ui.path, 'utf-8')
    expect(uiContent.trim()).toEqual('Pacific')
  })
  test('additional objects are logged (in JSON format) after the text message', async () => {
    const f = await Tmp.file({})
    const ui = await Tmp.file({ keep: true })
    const uiStream = fse.createWriteStream(ui.path)

    const logger = createDefaultLogger(f.path, undefined, uiStream)
    logger.info(`Atlantic`, { maxDepth: 8376, waterVolum: '310,410,900 km^3' })
    logger.info(`Indian`, { maxDepth: 7258, surfacrArea: '70,560,000 km^2' })
    logger.info(`-the end-`)

    const fileContent = await readContent(f.path, '-the end-')
    expect(fileContent).toContain(`[info] Atlantic {"maxDepth":8376,"waterVolum":"310,410,900 km^3"}\n`)
    expect(fileContent).toContain(`[info] Indian {"maxDepth":7258,"surfacrArea":"70,560,000 km^2"}\n`)
  })
})
