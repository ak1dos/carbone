var path = require("path");
var xml2js = require("@enfexia/xml2js");
var xpath = require("xml2js-xpath");
var extend = require("util")._extend;
var sizeOf = require("image-size");

var imageprocessor = {
  clearEmptyImages: function (document) {
    xml2js.parseString(
      document.data,
      { preserveChildrenOrder: true, explicitChildren: true },
      (err, root) => {
        let builder = new xml2js.Builder();
        var empty = xpath
          .find(root, "//w:drawing")
          .filter(
            (x) =>
              xpath.find(x, "//pic:pic/pic:nvPicPr/pic:cNvPr")[0].$.descr ===
                "" &&
              xpath.find(x, "//pic:pic/pic:nvPicPr/pic:cNvPr")[0].$.dynamic ===
                "true"
          );

        empty.map((item) => {
          item["wp:anchor"] = null;
        });

        document.data = builder.buildObject(root);
      }
    );
    return document;
  },

  processDynamicImage: function (
    report,
    state,
    document,
    drawing,
    picture,
    definition,
    fullUrl
  ) {
    let builder = new xml2js.Builder();

    var contains = definition.contains;

    // If image is to be contained and not stretched
    if (contains === "true") {
      xml2js.parseString(
        document.data,
        { preserveChildrenOrder: true, explicitChildren: true },
        (err, result) => {
          document.data = imageprocessor.processImageUrl(
            result,
            true,
            fullUrl,
            picture,
            drawing,
            builder
          );
        }
      );
    }

    var qrcode = definition.sqrcode ? true : false;

    // Get the relation element
    var relationId = xpath.find(
      xpath.find(picture, "//pic:blipFill")[0],
      "//a:blip"
    )[0].$["r:embed"];

    var relationNode = undefined;

    // Get the relation node in relations document
    if (document.name.includes("word/header")) {
      var header = document.name.split("word/").join("");
      relationNode = report.files.find((x) =>
        x.name.includes("word/_rels/" + header + ".rels")
      );
    } else if (document.name.includes("word/footer")) {
      var footer = document.name.split("word/").join("");
      relationNode = report.files.find((x) =>
        x.name.includes("word/_rels/" + footer + "rels")
      );
    } else {
      relationNode = report.files.find((x) =>
        x.name.includes("word/_rels/document.xml.rels")
      );
    }

    // Parse the relation document
    xml2js.parseString(relationNode.data, (err, relationMatch) => {
      // Get all relations
      var relations = xpath.find(relationMatch, "//Relationships");

      // Get the relation with our id
      var relation = xpath
        .find(relationMatch, "//Relationships/Relationship")
        .find((x) => x.$.Id === relationId);
      let relationState = state.find((x) => x.key === relationId);

      // If it as a tag in description and its not the first iteration
      if (relationState && fullUrl) {
        relationState.number += 1;

        // Get the media of the relation
        let media = report.files.find(
          (x) => x.name === "word/" + relation.$.Target
        );

        // Get the corresponding relation node
        let rel = relations[0].Relationship.find(
          (x) => x.$.Id === relationId && x.$.Target === relation.$.Target
        );

        // Copy the relation and change media values
        let newRel = {};
        var name = relation.$.Target.split(".").join(
          relationState.number + "."
        );
        newRel.$ = extend({}, rel.$);
        newRel.$.Id = relationId + "_" + relationState.number;
        newRel.$.Target = name;
        relationMatch.Relationships.Relationship.push(newRel);

        // Build the new relation document node

        relationNode.data = builder.buildObject(relationMatch);

        xml2js.parseString(
          document.data,
          { preserveChildrenOrder: true, explicitChildren: true },
          (err, newResult) => {
            // Find all pics

            var pics = xpath.find(newResult, "//pic:pic");

            // Find out working pic
            let pic = pics.find(
              (x) =>
                xpath.find(xpath.find(x, "//pic:nvPicPr")[0], "//pic:cNvPr")[0]
                  .$.descr === fullUrl
            );

            // Get the blip where the relation is setted and replace him by the new relation
            let blip = pic["pic:blipFill"][0]["a:blip"][0];
            blip.$["r:embed"] = blip.$["r:embed"] + "_" + relationState.number;
            document.data = builder.buildObject(newResult);

            // Extend the media
            let newMedia = extend({}, media);
            newMedia.name = "word/" + name;
            newMedia.data = fullUrl;

            // Remove the processed url for a inoquos relation tag
            document.data = document.data
              .replace(fullUrl, relationId + "_" + relationState.number)
              .replace(fullUrl, relationId + "_" + relationState.number);

            // Add the new media to report files
            report.files.push(newMedia);
          }
        );
      }
      // If has tag and its first iterationresult
      else if (fullUrl) {
        state.push({ key: relationId, number: 1 });

        // Find the media of the picture
        let media = report.files.find(
          (x) => x.name === "word/" + relation.$.Target
        );

        // Remove the processed url for a inoquos relation tag
        document.data = document.data
          .replace(fullUrl, relationId)
          .replace(fullUrl, relationId);

        // Change the mock media binary data for the url (will be replaced in files.js by the binary)
        media.data = qrcode ? "qrcode://" + fullUrl : fullUrl;
      }
    });
    return { report: report, state: state };
  },
  processImageUrl: function (
    result,
    contains,
    fullUrl,
    match,
    drawing,
    builder
  ) {
    if (contains) {
      let url = fullUrl;
      let dimensions = null;
      if (fullUrl.includes("file://")) {
        url = fullUrl.replace("file://", "");
        dimensions = sizeOf(url);
      }
      if (fullUrl.includes(";base64,")) {
        url = fullUrl.split(";base64,").pop();
        dimensions = sizeOf(Buffer.from(url, "base64"));
      }

      let spPr = xpath.find(match, "//pic:spPr")[0];
      let size = spPr["a:xfrm"][0]["a:ext"][0].$;
      if (dimensions) {
        if (dimensions.width > dimensions.height) {
          let heigth = Math.round(
            (size.cx * (dimensions.height * 10000)) / (dimensions.width * 10000)
          );
          size.cy = heigth.toString();
          drawing["wp:anchor"][0]["wp:extent"][0] = { $: size };
          spPr["a:xfrm"][0]["a:ext"][0] = { $: size };
        } else {
          let width = Math.round(
            (size.cy * (dimensions.width * 10000)) / (dimensions.height * 10000)
          );
          size.cx = width.toString();
          drawing["wp:anchor"][0]["wp:extent"][0] = { $: size };
          spPr["a:xfrm"][0]["a:ext"][0] = { $: size };
        }
      } else {
        size.cx = "0";
        size.cy = "0";
        drawing["wp:anchor"][0]["wp:extent"][0] = { $: size };
        spPr["a:xfrm"][0]["a:ext"][0] = { $: size };
        spPr = null;
      }
    }
    return builder.buildObject(result);
  },
};

function search(obj, predicate) {
  let result = [];
  for (let p in obj) {
    // iterate on every property
    // tip: here is a good idea to check for hasOwnProperty
    if (typeof obj[p] == "object") {
      // if its object - lets search inside it
      result = result.concat(search(obj[p], predicate));
    } else if (predicate(p, obj[p])) result.push(obj); // check condition
  }
  return result;
}

module.exports = imageprocessor;
