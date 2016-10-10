const csv = require('csv');
const fs = require('fs');
const request = require('request-promise');
const inquirer = require('inquirer-promise');
const sink = require('stream-sink');
require('dotenv').load();

const argv = require('yargs')
  .usage('Pushes Daily Time App (https://dailytimeapp.com) CSV exports to JIRA')
  .example('dailyapp2jira Daily\ Export\ \(29:01:16\ -\ 29:01:16\).csv')
  .option('quiet', {
    alias: 'q',
    default: !process.stdin.isTTY,
    describe: "Don't ask for confirmation"
  })
  .option('delimiter', {
    alias: 'd',
    default: ',',
    describe: 'Delimiter used for the CSV'
  })
  .demand(process.stdin.isTTY ? 1 : 0)
  .argv;

const inStream = argv._[0] ? fs.createReadStream(argv._[0]) : process.stdin;

inStream
  .pipe(csv.parse({ delimiter: ',', comment: '#', columns: ['activity', 'timeInMinutes'] }))
  .pipe(csv.transform(parseCsvRecord))
  .pipe(sink({ objectMode: true }))
  .on('data', worklog => checkWorklog(worklog)
    .then(askForConfirmation)
    .then(submitToJira)
    .catch(err => console.log(err.message, JSON.stringify(err)))
  )
  .on('error', err => { throw new Error(err) });

/**
 * Parse CSV records to a JSON structure, aka "worklog".
 */
var date;
function parseCsvRecord(record) {
  // This is the date line
  if (!record.activity && record.timeInMinutes.includes('/')) {
    date = convertDate(record.timeInMinutes);
    return;
  }

  const issue = parseIssue(record.activity);
  return {
    date: date,
    number: issue.number,
    description: issue.description,
    timeInMinutes: record.timeInMinutes,
  };
}

/**
 * Checks a given worklog for mistakes.
 *
 * @param worklog
 * @throws Error if mistakes are found.
 * @returns {Array} Correct worklog.
 */
function checkWorklog(worklog) {
  const info = missingInfo(worklog);

  if (info.length) {
    return Promise.reject(Error("Missing data for: \n" + info.join("\n")));
  }

  return Promise.resolve(worklog);
}

/**
 * Push data to Jira.
 * @param {Array} worklog
 */
function submitToJira(worklog) {
  // Post each work log
  console.log('Sending to Jira...');
  return Promise.all(worklog.map(postWorklogToJira))
    .then(res => console.log(`Transferred ${res.length} entries.`));
}

/**
 * Checks if the user wants to commit the data
 * @param {Array} worklog
 */
function askForConfirmation(worklog) {
  if (argv.quiet) {
    return Promise.resolve(worklog);
  }

  dumpWorklog(worklog, console);

  return inquirer
    .confirm('Does this look alright?')
    .then(confirmed => confirmed ? Promise.resolve(worklog) : Promise.reject('Canceled'));
}

/**
 * Parses a JIRA issue number from a text.
 *
 * A Jira issue number always is some capital letters,
 * a minus and a number. Example: XXX-12345.
 *
 * @param text
 * @returns {Object} Issue number and description.
 */
function parseIssue(text) {
  var issue = /([A-Z0-9]{2,10}-\d{1,5})(.*)/.exec(text);

  if (!issue) {
    return { number: null, description: text };
  }

  return {
    number: issue[1],
    description: issue[2].trim()
  };
}

/**
 * Returns missing info in a worklog.
 *
 * @param {Array} worklog
 * @returns {Array}
 */
function missingInfo(worklog) {
  var missingInfo = worklog.filter(function (row) {
    return row.timeInMinutes <= 0 || !row.number || !row.description;
  });

  return missingInfo.map(row => row.number + " " + row.description);
}

/**
 * Post a single work log to jira.
 *
 * @param log Single work log.
 */
function postWorklogToJira(log) {
  return request({
      method: 'POST',
      uri: process.env.TEMPO_BASE + 'worklogs/',
      headers: {
        Authorization: 'Basic ' + process.env.JIRA_TOKEN
      },
      body: {
        issue: {
          key: log.number,
        },
        author: {
          name: process.env.JIRA_USER,
        },
        dateStarted: log.date + 'T18:00:00.000+0000',
        timeSpentSeconds: log.timeInMinutes * 60,
        billedSeconds: 0,
        comment: log.description
      },
      json: true,
    });
}

/**
 * Converts 27/01/16 format to '2016-01-27'.
 */
function convertDate(date) {
  var part = date.split('/');

  return [part[2], part[1], part[0]].join('-');
}

/**
 * Dumps worklog on the given output log.
 *
 * @param worklog
 * @param console
 */
function dumpWorklog(worklog, console) {
  console.log(worklog.length + " entries:");
  worklog
    .map(log =>
      [
        log.number,
        log.timeInMinutes + ' min',
        log.description
      ].join("\t")
    )
    .map(log => console.log(log));
}
