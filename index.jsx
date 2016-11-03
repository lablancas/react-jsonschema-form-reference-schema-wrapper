import _ from 'lodash'
import React from 'react'
import traverse from'traverse'
import 'react-selectize/themes/index.css'
import { SimpleSelect } from 'react-selectize'

// NOTE: use a custom ObjectSchemaField is a better solution
// NOTE: move this to uiSchema, maybe not, because this is not documented in uiSchema
function addReferenceSchema(uiSchema={}, referenceSchema, findRefs, stringifyReferenceData) {
  const uiSchemaCopy = _.cloneDeep(uiSchema)

  traverse(referenceSchema).forEach(function(value) {
    if (value && typeof value['$ref'] === 'string') {
      _.set(
        uiSchemaCopy,
        this.path.join('.'),
        {
          'ui:widget': {
            component: 'reference',
            options: {
              findRefs,
              stringifyReferenceData,
              ...value
            },
          },
        }
      )
    }
  })

  return uiSchemaCopy
}

class ReferenceWidget extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      docs: [],
      selectedValue: null,
    }
    this.search = ''

    // get initial for selectize
    if (this.props.value) {
      this.handleSearchChange(this.props.value, (docs) => {
        const selectedValue = _.find(
          docs.map((doc) => this.docToOption(doc)),
          {value: this.props.value}
        )
        this.setState({ selectedValue })
      })
    } else {
      this.handleSearchChange()
    }
  }

  docToOption(doc) {
    const { options: { remoteKey } } = this.props
    return {
      label: doc[remoteKey],
      value: doc[remoteKey],
    }
  }

  handleSearchChange(searchTerm, callback) {
    const { findRefs, $ref } = this.props.options

    findRefs(
      {
        $ref,
        searchTerm,
        callback: (docs) => {
          this.setState({ docs })
          callback && callback(docs)
        }
      }
    )
  }

  handleValueChange(selectedValue) {
    this.setState({selectedValue})

    // !REFERENCE_BSON!${metaValue} for referenceWrapper to consume
    const { onChange, options: { dependents, stringifyReferenceData } } = this.props
    const value = _.get(selectedValue, 'value') || ''

    const selectedDoc = _.find(this.state.docs, { [this.props.options.remoteKey]: value }) || {}
    const metaValue = {
      value,
      dependents: dependents.map(
        ({ key, remoteKey }) => ({ key, value: selectedDoc[remoteKey] })
      )
    }

    onChange(stringifyReferenceData(metaValue))
  }

  render() {
    return <SimpleSelect
      onSearchChange={(search) => this.handleSearchChange(search)}
      filterOptions={(options) => options}
      style={{ width: '100%' }}
      options={this.state.docs.map((doc) => this.docToOption(doc))}
      value={this.state.selectedValue}
      onValueChange={(selectedValue) => this.handleValueChange(selectedValue)}
    />
  }
}

class ReferenceSchemaForm extends React.Component {
  handleOnChange(event) {
    const changes = []
    const { parseReferenceData } = this.props

    const formData = traverse(_.cloneDeep(event.formData)).map(function(value) {
      if (typeof value === 'string') {
        const referenceObj = parseReferenceData(value)
        if (referenceObj) {
          const { dependents, value } = referenceObj
          dependents && dependents.forEach(({ key, value }) => {
            changes.push({
              path: this.parent.path.concat(key).join('.'),
              value
            })
          })
          return value
        }
      }
    })

    changes.forEach(({ path, value }) => {
      _.set(formData, path, value)
    })

    this.props.onChange(Object.assign({}, event, {formData}))
  }

  render() {
    const {
      uiSchema,
      referenceSchema,
      stringifyReferenceData,
      findRefs,
      Form,
      widgets,
      onChange,
      ...other
    } = this.props

    const extendedUiSchema = addReferenceSchema(
      uiSchema,
      referenceSchema,
      findRefs,
      stringifyReferenceData
    )

    return <Form
      widgets={{ reference: ReferenceWidget, ...widgets }}
      uiSchema={extendedUiSchema}
      onChange={(event) => this.handleOnChange(event)}
      {...other}
    />
  }
}

const KEY_WORD = '!REFERENCE!'

export default function referenceSchemaWrapper (Form, {findRefs, parse=JSON.parse, stringify=JSON.stringify}) {
  const parseReferenceData = (string) => {
    if (string.indexOf(KEY_WORD) === 0) {
      return parse(string.replace(KEY_WORD, ''))
    }
  }

  const stringifyReferenceData = (object) => {
    return `${KEY_WORD}${stringify(object)}`
  }

  return (props) => (
    <ReferenceSchemaForm
      Form={Form}
      parseReferenceData={parseReferenceData}
      stringifyReferenceData={stringifyReferenceData}
      findRefs={findRefs}
      {...props}/>
  )
}
