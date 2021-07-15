var path = require("path");
var xml2js = require("@enfexia/xml2js");
var xpath = require("xml2js-xpath");

var imageprocessor = require("./imageprocessor");

var postprocessor = {
  /**
   * Execute preprocessor on main, and embedded document
   * @param  {Object}   report
   */
  execute: function (report, callback) {
    if (report === null || report.files === undefined) {
      return callback(null, report);
    }
    for (var i = -1; i < report.embeddings.length; i++) {
      var _mainOrEmbeddedTemplate = report.filename;
      var _fileType = report.extension;
      if (i > -1) {
        // If the current template is an embedded file

        _fileType = path
          .extname(_mainOrEmbeddedTemplate)
          .toLowerCase()
          .slice(1);
      }
      switch (_fileType) {
        case "odt":
          postprocessor.replaceImageODT(report);
          break;
        case "docx":
          postprocessor.replaceImageDocx(report);
          break;
        default:
          break;
      }
    }
    return callback(null, report);
  },

  /**
   * Pre-process image replacement in Docx template
   * Find all media files and replace the value of dummy images for the carbone tag when it exists. In that case only mark the media file as isMarked to be searched for tags
   *
   * @param  {Object} report (modified)
   * @return {Object}          template
   */
  replaceImageDocx: function (report) {
    /*
    const imageCount = report.files.filter((x) => x.name.match(/.(png)$/i));

    if (imageCount.length === 0) {
      return report;
    }*/

    let documents = [0];
    documents[0] = report.files.find((x) => x.name === "word/document.xml");
    documents = [
      ...documents,
      ...report.files.filter((x) => x.name.includes("word/header")),
    ];
    documents = [
      ...documents,
      ...report.files.filter((x) => x.name.includes("word/footer")),
    ];

    documents.map((document) => {
      //document = imageprocessor.clearEmptyImages(document);

      xml2js.parseString(document.data, (err, root) => {
        // Find all pic tags in file
        var matches = xpath
          .find(root, "//w:drawing")
          .filter((x) => x["wp:anchor"] !== "");

        let state = [];

        // For each match
        matches.map((drawing) => {
          // Find the description tag
          let match = xpath.find(drawing, "//pic:pic")[0];

          let definition = xpath.find(
            xpath.find(match, "//pic:nvPicPr")[0],
            "//pic:cNvPr"
          )[0].$;

          var fullUrl = definition.descr;
          var dynamic = definition.dynamic;

          if (fullUrl && dynamic) {
            let result = imageprocessor.processDynamicImage(
              report,
              state,
              document,
              drawing,
              match,
              definition,
              fullUrl
            );
            report = result.report;
            state = result.state;
          }
        });
      });

      return report;
    });
  },

  /**
   * Pre-process image replacement in ODT template
   * Find all media files and replace the value of dummy images for the carbone tag when it exists. In that case only mark the media file as isMarked to be searched for tags
   *
   * @param  {Object} template (modified)
   * @return {Object}          template
   */
  replaceImageODT: function (template) {
    let document = template.files.find((x) => x.name === "content.xml");

    xml2js.parseString(
      document.data,
      { preserveChildrenOrder: true, explicitChildren: true },
      (err, result) => {
        var matches = xpath.find(result, "//draw:frame");

        matches.map((match, index) => {
          let desc = match["svg:desc"];
          if (desc) {
            xpath.find(match, "//draw:image")[0].$["xlink:href"] = undefined;
            xpath.find(match, "//draw:image")[0].$["loext:mime-type"] =
              undefined;

            let url = desc[0];
            desc[0] = index;

            xpath.find(match, "//draw:image")[0]["office:binary-data"] = [url];

            let builder = new xml2js.Builder();
            document.data = builder.buildObject(result);
          }
        });
      }
    );

    return template;
  },
};

module.exports = postprocessor;
