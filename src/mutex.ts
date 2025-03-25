import { Mutex } from 'async-mutex'

const zimCreatorMutex = new Mutex()

export { zimCreatorMutex }
