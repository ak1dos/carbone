
const moment = require('moment');
const get = require('lodash/get');

/**
 * Module that prints generic objects like booleans, dates, accumulators. Also applies specific formats to text.
 */
const printerModule = {
  /**
   * Gets a formatted string of a object
   * @param field Field information based on a field option
   * @param value The value of the field in the record
   * @param locale The locale information
   * @returns {string}
   */
  print : function (field, value, locale) {
    let result;
    if (Array.isArray(value)) {
      if (field.operator) {
        result = _applyOperator(value, field.operator);
      }
      else {
        let values = [];
        value.forEach((item) => {
          values.push(this.print(field, item, locale));
        });
        result = values.join(', ');
      }
    }
    else {
      // boolean
      if (typeof value === 'boolean') {
        result = value ? '✓' : '✗';
      }
      // normal
      else {
        result = _format(field.format, value, locale);
      }
    }

    return result;
  },
};

function _format (format, value, locale) {
  if (format) {
    if (format.includes('LOCALE')) {
      format = format.split('LOCALE').join(locale);
    }

    switch (format) {
      case 'date':
        value = moment(value).format('YYYY/MM/DD');
        break;
      case 'datetime':
        value = moment(value).format('YYYY/MM/DD HH:mm');
        break;
      case 'tuple':
        value = value.label[locale] + ': ' + value.value;
        break;
      default:
        value = get(value, format);
        break;
    }
  }
  return value;
}

function _applyOperator (array, operator) {
  if (operator) {
    switch (operator) {
      case 'count':
        return array.length;
      case 'max':
        return Math.max(...array);
      case 'min':
        return Math.min(...array);
      case 'sum':
        return array.reduce((a, b) => a + b, 0);
    }
  }
}

module.exports = printerModule;
