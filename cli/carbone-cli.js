#!/usr/bin/env node

const yargonaut = require('yargonaut').style('blue');
const yargs = require('yargs');
const fs = require('fs');
const carbone = require('../lib/index');
const figlet = require('figlet');
const chalk = yargonaut.chalk();

const options = yargs
  .usage(
    chalk.red(figlet.textSync('KEEP SOLUTIONS')) +
      '\n\n' +
      chalk.blue('CARBONE by David Grealund') +
      '\n\n' +
      'Generate reports (odt, docx, txt, pdf, ods, xlsx, csv) via a template (odt, docx, xlsx, csv).' +
      '\n\nUsage\n -d <json data> -t <path to template> -o <json with options> -p <path of the output file>'
  )
  .option('d', {
    alias        : 'data',
    describe     : 'path to json with data',
    type         : 'string',
    demandOption : true,
  })
  .option('t', {
    alias        : 'template',
    describe     : 'path to document template',
    type         : 'string',
    demandOption : true,
  })
  .option('p', {
    alias        : 'path',
    describe     : 'path to output file',
    type         : 'string',
    demandOption : true,
  })
  .option('o', {
    alias        : 'options',
    describe     : 'path to json with options',
    type         : 'string',
    demandOption : false,
  })
  .version().argv;

let rawData = fs.readFileSync(options.data);
let data = JSON.parse(rawData);

let rawOptions = options.options ? fs.readFileSync(options.options) : null;
let carboneOptions = rawOptions ? JSON.parse(rawOptions) : '';
carboneOptions.lang = options.language || carboneOptions.lang || 'en';

// Generate a report using the sample template provided by carbone module
// This LibreOffice template contains "Hello {d.firstname} {d.lastname} !"
// Of course, you can create your own templates!
carbone.render(options.template, data, carboneOptions, function (err, result) {
  if (err) {
    return console.log(err);
  }
  // write the result
  fs.writeFileSync(options.path, result);
  console.log(chalk.green('File generated in ' + options.path));
  process.exit();
});
