import urlBuilder from './url.builder.js'

class ModuleURLDirector {
  buildBasicURL(domain: string, path?: string) {
    return urlBuilder
      .setDomain(domain)
      .setPath(path ?? 'w/load.php')
      .build(false, '?')
  }
}

const moduleURLDirector = new ModuleURLDirector()

export default moduleURLDirector
