import { ensureTrailingChar } from '../../misc.js'

class URLBuilder {
  private domain = ''
  private path = ''
  private queryParams = ''

  setDomain(domain: string) {
    this.domain = domain

    return this
  }

  setPath(path: string) {
    this.path = path

    return this
  }

  /**
   * This function sets query parameters for a URL.
   *
   * @param params - These key-value pairs represent the query parameters that will be added to the URL.
   * @param [trailingChar] - trailingChar is an optional parameter that specifies a character
   * to be added at the beginning of the query parameters string. It is used to indicate the start of
   * the query parameters in a URL.
   *
   * @returns the current object (`this`) after setting the `queryParams` property to a string
   */
  setQueryParams<T extends Record<string, string>>(params: T, trailingChar = '?') {
    const queryParams = new URLSearchParams(params)

    this.queryParams = trailingChar + queryParams.toString()

    return this
  }

  /**
   * This function builds a URL by combining the domain, path, and query parameters, and can optionally
   * add a trailing character and return a URL object.
   *
   * @param [returnUrl] - A boolean parameter that determines whether the method should
   * return a URL object or a string.
   * @param [trailingChar] - The `trailingChar` parameter is an optional string parameter that
   * specifies a character to be added at the end of the generated link.
   *
   * @returns The `build` function returns a string that represents a URL constructed from the
   * `domain`, `path`, and `queryParams` properties of the object. The returned URL can optionally have
   * a trailing character appended to it, and can be returned as a string or as a `URL` object
   * depending on the values of the `returnUrl` and `trailingChar` parameters.
   */
  build(returnUrl?: boolean, trailingChar?: string) {
    const currentDomain = this.domain
    const currentPath = this.path
    const currentQueryParams = this.queryParams

    this.domain = ''
    this.path = ''
    this.queryParams = ''

    if (!currentDomain) {
      throw new Error('The link must contain a domain')
    }

    const link = currentDomain + currentPath + currentQueryParams

    if (returnUrl && trailingChar) {
      return new URL(ensureTrailingChar(link, trailingChar))
    }

    if (returnUrl && !trailingChar) {
      return new URL(link)
    }

    if (!returnUrl && trailingChar) {
      return ensureTrailingChar(link, trailingChar)
    }

    return link
  }
}

const urlBuilder = new URLBuilder()

export default urlBuilder
