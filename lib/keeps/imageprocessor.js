const xml2js = require('xml2js');
const xpath = require('xml2js-xpath');
const extend = require('util')._extend;
const sizeOfImage = require('image-size');

const imageprocessor = {
  /**
   * Clear all dynamic images that were not replaced by valid ones.
   * @param document
   * @returns {*}
   */
  clearEmptyImages : function (document) {
    // Open the document in xml format
    xml2js.parseString(document.data, (err, root) => {
      // Create a builder to create a new xml from a string
      const builder = new xml2js.Builder();

      // Search all images with empty tags, they were marked as dynamic in pre-processing but were replaced by empty elements.
      const empty = xpath
        .find(root, '//w:drawing')
        .filter(
          (x) => xpath.find(x, '//pic:pic/pic:nvPicPr/pic:cNvPr')[0].$.descr === '' && xpath.find(x, '//pic:pic/pic:nvPicPr/pic:cNvPr')[0].$.dynamic === 'true'
        );

      // reset all empty images anchor, this way they will not occupy space in the document.
      empty.forEach((item) => {
        item['wp:anchor'] = null;
      });

      // replace the document data by the new one already updated
      document.data = builder.buildObject(root);
    });
    return document;
  },
  /**
   * Process a dynamic image replacing and formatting all needed information in various parts of the template document.
   * @param report
   * @param currentState
   * @param document
   * @param drawing
   * @param picture
   * @param contained
   * @param qrCodeSection
   * @param fullUrl
   * @returns {{report, state}}
   */
  processDynamicImage : function (report, currentState, document, drawing, picture, contained, qrCodeSection, fullUrl) {
    // Create a builder to parse string xml to xml.
    let builder = new xml2js.Builder();

    // If image is to be contained and not stretched process the image first
    if (contained === 'true') {
      xml2js.parseString(document.data, (err, result) => {
        document.data = _transformContainedImage(result, true, fullUrl, picture, drawing, builder);
      });
    }

    return _processImageRelations(report, currentState, document, picture, qrCodeSection, fullUrl, builder);
  },
};

module.exports = imageprocessor;


/**
* Process all sections related to the image file in word document
* @param report
* @param currentState
* @param document
* @param picture
* @param qrCodeSection
* @param fullUrl
* @param builder
* @returns {{report, state}}
* @private
*/
function _processImageRelations (report, currentState, document, picture, qrCodeSection, fullUrl, builder) {
  const qrcode = !!qrCodeSection;

  // Get the relation element
  const relationId = xpath.find(xpath.find(picture, '//pic:blipFill')[0], '//a:blip')[0].$['r:embed'];

  let relationNode = undefined;

  // Get the relation node in relations document
  if (document.name.includes('word/header')) {
    const header = document.name.split('word/').join('');
    relationNode = report.files.find((x) => x.name.includes('word/_rels/' + header + '.rels'));
  }
  else if (document.name.includes('word/footer')) {
    const footer = document.name.split('word/').join('');
    relationNode = report.files.find((x) => x.name.includes('word/_rels/' + footer + 'rels'));
  }
  else {
    relationNode = report.files.find((x) => x.name.includes('word/_rels/document.xml.rels'));
  }

  // Parse the relation document
  xml2js.parseString(relationNode.data, (err, relationMatch) => {
    // Get all relations
    const relations = xpath.find(relationMatch, '//Relationships');

    // Get the relation with our id
    const relation = xpath.find(relationMatch, '//Relationships/Relationship').find((x) => x.$.Id === relationId);
    let relationState = currentState.find((x) => x.key === relationId);

    // If it as a tag in description and its not the first iteration
    if (relationState && fullUrl) {
      relationState.number += 1;

      // Get the media of the relation
      const media = report.files.find((x) => x.name === 'word/' + relation.$.Target);

      // Get the corresponding relation node
      const rel = relations[0].Relationship.find((x) => x.$.Id === relationId && x.$.Target === relation.$.Target);

      // Copy the relation and change media values
      let newRel = {};
      const name = relation.$.Target.split('.').join(relationState.number + '.');
      newRel.$ = extend({}, rel.$);
      newRel.$.Id = relationId + '_' + relationState.number;
      newRel.$.Target = name;
      relationMatch.Relationships.Relationship.push(newRel);

      // Build the new relation document node
      relationNode.data = builder.buildObject(relationMatch);

      xml2js.parseString(document.data, (err, newResult) => {
        // Find all pics
        var pics = xpath.find(newResult, '//pic:pic');

        // Find out working pic
        let pic = pics.find((x) => xpath.find(xpath.find(x, '//pic:nvPicPr')[0], '//pic:cNvPr')[0].$.descr === fullUrl);

        // Get the blip where the relation is set and replace him by the new relation
        let blip = pic['pic:blipFill'][0]['a:blip'][0];
        blip.$['r:embed'] = blip.$['r:embed'] + '_' + relationState.number;
        document.data = builder.buildObject(newResult);

        // Extend the media
        let newMedia = extend({}, media);
        newMedia.name = 'word/' + name;
        newMedia.data = fullUrl;

        // Remove the processed url for a innocuous relation tag
        document.data = document.data.split(fullUrl).join(relationId + '_' + relationState.number);

        // Add the new media to report files
        report.files.push(newMedia);
      });
    }
    // If has tag and its first iteration result
    else if (fullUrl) {
      currentState.push({ key : relationId, number : 1 });

      // Find the media of the picture
      let media = report.files.find((x) => x.name === 'word/' + relation.$.Target);

      // Remove the processed url for a innocuous relation tag
      document.data = document.data.split(fullUrl).join(relationId);

      // Change the mock media binary data for the url (will be replaced in files.js by the binary)
      media.data = qrcode ? 'qrcode://' + fullUrl : fullUrl;
    }
  });

  return {report : report, state : currentState};
}

/**
 *
 * @param result
 * @param contained
 * @param fullUrl
 * @param match
 * @param drawing
 * @param builder
 * @returns {*} XML with the processed image
 * @private
 */
function _transformContainedImage (result, contained, fullUrl, match, drawing, builder) {
  if (contained) {
    let url = fullUrl;
    let dimensions = null;

    // Parse the fullUrl for both cases: a file system file and a base64 file, and get the url and the dimensions
    if (fullUrl.includes('file://')) {
      url = fullUrl.replace('file://', '');
      dimensions = sizeOfImage(url);
    }
    else if (fullUrl.includes(';base64,')) {
      url = fullUrl.split(';base64,').pop();
      dimensions = sizeOfImage(Buffer.from(url, 'base64'));
    }

    // Get the shape and the size of the image in the template
    let spPr = xpath.find(match, '//pic:spPr')[0];
    let size = spPr['a:xfrm'][0]['a:ext'][0].$;

    if (dimensions) {
      // Apply if the image is horizontal
      if (dimensions.width > dimensions.height) {
        // Calculate the new height
        let heigth = Math.round((size.cx * (dimensions.height * 10000)) / (dimensions.width * 10000));
        size.cy = heigth.toString();

        // Apply the new size to the anchor and the shape tags of the image
        drawing['wp:anchor'][0]['wp:extent'][0] = { $ : size };
        spPr['a:xfrm'][0]['a:ext'][0] = { $ : size };
      }
      // Apply if the image is vertical
      else {
        // Calculate the new width
        let width = Math.round((size.cy * (dimensions.width * 10000)) / (dimensions.height * 10000));
        size.cx = width.toString();

        // Apply the new size to the anchor and the shape tags of the image
        drawing['wp:anchor'][0]['wp:extent'][0] = { $ : size };
        spPr['a:xfrm'][0]['a:ext'][0] = { $ : size };
      }
    }
    // If no dimensions exist let the image have 0 size.
    else {
      size.cx = '0';
      size.cy = '0';
      drawing['wp:anchor'][0]['wp:extent'][0] = { $ : size };
      spPr['a:xfrm'][0]['a:ext'][0] = { $ : size };
      spPr = null;
    }
  }

  // Return the builded result in xml
  return builder.buildObject(result);
}
