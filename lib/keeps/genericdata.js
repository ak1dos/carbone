const get = require('lodash/get');
const printerModule = require('lib/keeps/printfields');

/**
 * Function that generates data based on fields given in options. To be used in generic reports.
 * @param data
 * @param carboneOptions
 * @returns {*}
 */
const createGenericData = (data, carboneOptions) => {
  // Process the data only if there are genericOptions
  if (carboneOptions.generic) {
    // Get the field information from options
    let genericFields = carboneOptions.generic.fields;

    // If report data has a single record
    if (data.record) {
      data.generic = { record : { fields : _generateFields(data.record, genericFields, carboneOptions.lang) } };
    }
    // If report data has a array of records
    else if (data.records) {
      let fields = [];


      data.records.forEach((record) => {
        fields.push({ fields : _generateFields(record, genericFields, carboneOptions.lang ) });
      });

      data.generic = { records : fields };
    }
  }

  return data;
};

/**
 * Generate the fields based on record data.
 * @param record
 * @param genericFields
 * @param locale
 * @returns {*[]} The list of fields
 * @private
 */
function _generateFields(record, genericFields, locale) {
  let fields = [];

  genericFields.forEach((genericField) => {
    let value = get(record, genericField.field);
    let label = genericField.label[locale];

    if (value) {
      fields.push({
        label : label,
        value : printerModule.print(
          genericField,
          value,
          locale
        ),
      });
    }
  });

  return fields;
}

exports.createGenericData = createGenericData;
