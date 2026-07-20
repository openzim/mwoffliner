import { Mutex } from 'async-mutex'

const zimCreatorMutex = new Mutex()
const fileAddMutex = new Mutex()
const fileDownloadMutex = new Mutex()

export { zimCreatorMutex, fileAddMutex, fileDownloadMutex }
