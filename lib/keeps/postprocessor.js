// Global imports
const path = require('path');
const xml2js = require('xml2js');
const xpath = require('xml2js-xpath');

// Local imports
const imageprocessor = require('./imageprocessor');

/**
 * Class with methods to run after processing the template. It runs different methods for odt files or docx files because they have different formats.
 */
const postprocessor = {
  execute : function (report, callback) {
    if (report === null || report.files === undefined) {
      return callback(null, report);
    }
    for (let i = -1; i < report.embeddings.length; i++) {
      const _mainOrEmbeddedTemplate = report.filename;
      let _fileType = report.extension;
      if (i > -1) {
        // If the current template is an embedded file
        _fileType = path.extname(_mainOrEmbeddedTemplate).toLowerCase().slice(1);
      }
      switch (_fileType) {
        case 'odt':
          _replaceImageODT(report);
          break;
        case 'docx':
          _replaceImageDocx(report);
          break;
        default:
          break;
      }
    }
    return callback(null, report);
  },
};

/**
 * Pre-process image replacement in Docx template
 * Find all media files and replace the value of dummy images for the carbone tag when it exists. In that case only mark the media file as isMarked to be searched for tags
 *
 * @param  {Object} report (modified)
 * @return {Object} template
 * @private
 */
function _replaceImageDocx (report) {
  // Split the docx report in document, header and footer (the parts that may have images in a Word document.
  let documents = [
    report.files.find((x) => x.name === 'word/document.xml'),
    ...report.files.filter((x) => x.name.includes('word/header')),
    ...report.files.filter((x) => x.name.includes('word/footer')),
  ];

  // for each section of the document clear the images with no replacement tags
  documents.map((document) => {
    document = imageprocessor.clearEmptyImages(document);

    // Open document in xml string format
    xml2js.parseString(document.data, (err, root) => {
      // Find all pic tags in file
      const matches = xpath.find(root, '//w:drawing').filter((x) => x['wp:anchor'][0] !== '');

      let state = [];

      // For each match
      matches.forEach((drawing) => {
        // Find the description tag (the one that as all the needed info to perform the replacement
        const match = xpath.find(drawing, '//pic:pic')[0];
        const definition = xpath.find(xpath.find(match, '//pic:nvPicPr')[0], '//pic:cNvPr')[0].$;

        // Get the two values that matter, the url in description field (already replaced from the template tag to the record data) and the information in the image is a dynamic one (should be replaced).
        const fullUrl = definition.descr;
        const dynamic = definition.dynamic;
        const contained = definition.contains || false;
        const sqrcode = definition.qrcode;

        if (fullUrl && dynamic) {
          // If all fields are valid process the Dynamic Image (replace, changing all document parts needed)
          let result = imageprocessor.processDynamicImage(report, state, document, drawing, match, contained, sqrcode, fullUrl);

          // Update the report and the current state based on the result
          report = result.report;
          state = result.state;
        }
      });
    });

    return report;
  });
}

/**
 * Pre-process image replacement in ODT template
 * Find all media files and replace the value of dummy images for the carbone tag when it exists. In that case only mark the media file as isMarked to be searched for tags
 *
 * @param  {Object} template (modified)
 * @return {Object}          template
 * @private
 */
function _replaceImageODT (template) {
  let document = template.files.find((x) => x.name === 'content.xml');

  xml2js.parseString(document.data, (err, result) => {
    const matches = xpath.find(result, '//draw:frame');

    matches.forEach((match, index) => {
      let desc = match['svg:desc'];
      if (desc) {
        xpath.find(match, '//draw:image')[0].$['xlink:href'] = undefined;
        xpath.find(match, '//draw:image')[0].$['loext:mime-type'] = undefined;

        let url = desc[0];
        desc[0] = index;

        xpath.find(match, '//draw:image')[0]['office:binary-data'] = [url];

        let builder = new xml2js.Builder();
        document.data = builder.buildObject(result);
      }
    });
  });

  return template;
}

module.exports = postprocessor;
