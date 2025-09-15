import { Mutex } from 'async-mutex'

const zimCreatorMutex = new Mutex()
const fileDownloadMutex = new Mutex()

export { zimCreatorMutex, fileDownloadMutex }
