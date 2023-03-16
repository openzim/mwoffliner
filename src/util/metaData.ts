import AjvModule from 'ajv'

const Ajv = AjvModule.default
const ajv = new Ajv({ allErrors: true })

const schema = {
  type: 'object',
  properties: {
    Creator: { type: 'string', minLength: 1 },
    Description: { type: 'string', maxLength: 80, minLength: 1 },
    Language: { type: 'string', minLength: 1 },
    Publisher: { type: 'string', minLength: 1 },
    Title: { type: 'string', maxLength: 30, minLength: 1 },
  },
  required: ['Creator', 'Description', 'Language', 'Publisher', 'Title'],
  additionalProperties: true,
}

const validate = ajv.compile(schema)

export const validateMetadata = (metaData) => {
  const valid = validate(metaData)

  if (!valid) {
    const error = validate.errors[0]
    const keyword = error.instancePath.substring(1)

    if (error.keyword === 'required') {
      throw new Error(`Metadata "${error.params.missingProperty}" is required`)
    }
    if (error.keyword === 'minLength') {
      throw new Error(`Metadata "${keyword}" is required`)
    }
    if (error.keyword === 'maxLength') {
      throw new Error(`MetaData ${keyword}: ${error.message}`)
    }
    throw new Error(validate.errors[0].message)
  }
}
