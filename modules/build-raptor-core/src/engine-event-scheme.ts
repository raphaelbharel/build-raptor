import { ExitStatus } from 'repo-protocol'
import { RepoProtocolEvent } from 'repo-protocol'
import { TaskName } from 'task-name'

import { Phase } from './phase'
import { TaskStoreEvent } from './task-store-event'

export type EngineEventScheme = TaskStoreEvent &
  RepoProtocolEvent & {
    executionSkipped: TaskName
    executionShadowed: TaskName
    executionStarted: TaskName
    executionEnded: { taskName: TaskName; status: ExitStatus; outputFile: string; pathInRepo: string }
    taskPhaseEnded: { taskName: TaskName; phase: Phase }
  }
