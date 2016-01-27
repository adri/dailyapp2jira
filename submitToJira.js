var RANGE_TASKS = 'A7:A50';
var RANGE_MINUTES = 'B7:B50';
var RANGE_ISSUES = 'E7:F50';
var CELL_ISSUE_TITLE = 'E5';
var CELL_TOTAL_TITLE = 'E3';
var CELL_TOTAL = 'D3';
var CELL_DATE = 'B6';

// {issueIdOrKey}/worklog

function onOpen() {
  var sheet = currentSheet();

  // Add a total for the time
  setCellValue(sheet, CELL_TOTAL_TITLE, 'Total hours');
  setCellValue(sheet, CELL_TOTAL, '=CONVERT(SUM(' + RANGE_MINUTES + '); "mn"; "hr")');

  // Parse issue number and description
  setCellValue(sheet, CELL_ISSUE_TITLE, 'Issues');
  extractJiraIssues(sheet, RANGE_TASKS, RANGE_ISSUES);

  // Add menu hook to submit to jira
  var spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.addMenu('Jira', [ {name: 'Submit to Jira', functionName: 'submitToJira'} ]);
}

/**
 * Push data to Jira.
 */
function submitToJira() {
  var sheet = currentSheet();
  var worklog = getWorklog(sheet);

  // Warn when info is missing
  var missingInfo = worklog.filter(function (row) {
    return row.timeInMinutes <= 0 || !row.number || !row.description;
  });
  if (missingInfo.length > 0) {
    var info = missingInfo.map(function (row) { return row.number + " " + row.description});
    return SpreadsheetApp.getUi().alert("Missing data for: \n" + info.join("\n"));
  }

  // Post each work log
  var results = worklog.map(postWorklogToJira);

  showConfirmation(results);
}

/**
 * Post a single work log to jira.
 *
 * @param worklog
 */
function postWorklogToJira(worklog) {
  var worklogUrl = REST_JIRA_ISSUE + worklog.number + '/worklog';
  var worklogBody = {
    started: worklog.date + "T18:00:00.201+0000",
    timeSpent: worklog.timeInMinutes + 'm',
    comment: worklog.description
  };

  var response = UrlFetchApp.fetch(worklogUrl, {
    "method": "post",
    "headers": {
      "Authorization": "Basic " + REST_JIRA_TOKEN
    },
    "contentType": "application/json",
    "payload": JSON.stringify(worklogBody)
  });

  Logger.log("POST " + worklogUrl
    + "\n" + JSON.stringify(worklogBody)
    + "\n" + JSON.stringify(response)
  );
}

/**
 * Show modal to confirm submission.
 */
function showConfirmation() {
  var html = HtmlService.createHtmlOutput(
    '<p style="font-family: arial, sans-serif">'
    + 'Logged all times. Want to see Tempo? '
    + '<a target="_blank" href="https://enrise.atlassian.net/secure/TempoUserBoard!timesheet.jspa">Show Tempo</a>'
    + '</p>'
  );
  SpreadsheetApp.getUi().showModalDialog(html, 'Submitted to Jira');
}

/**
 * Returns a worklog of the current sheet.
 *
 * @param sheet
 * @returns {Array}
 */
function getWorklog(sheet) {
  var date = sheet.getRange(CELL_DATE).getValue();
  var minuteList = sheet.getRange(RANGE_MINUTES).getValues();
  var issueList = sheet.getRange(RANGE_ISSUES).getValues();

  return minuteList
    .map(function (time, i) {
      return {
        date: convertDate(date),
        timeInMinutes: time[0],
        number: issueList[i][0],
        description: issueList[i][1]
      };
    })
    .filter(function (row) {
      // Filter out lines without time.
      return row.timeInMinutes;
    });
}

/**
 * Takes a range of tasks (1 dimension) and splits
 * them up into a jira issue and a description (2 dimensions).
 *
 * @param sheet
 * @param rangeTasks
 * @param rangeIssues
 */
function extractJiraIssues(sheet, rangeTasks, rangeIssues) {
  var taskRange = sheet.getRange(rangeTasks);
  var issueRange = sheet.getRange(rangeIssues);

  var tasks = taskRange.getValues();
  var issueNumbers = tasks.map(function (task) {
    var issue = parseIssue(task[0]);
    return [issue.number, issue.description];
  });

  issueRange.setValues(issueNumbers);
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
  var issue = /([A-Z]{2,10}-\d{1,5})(.*)/.exec(text);

  if (!issue) {
    return { number: null, description: text };
  }

  return {
    number: issue[1],
    description: issue[2].trim()
  };
}

/**
 * Converts 27/01/16 format to '2016-01-27'.
 */
function convertDate(date) {
  var part = date.split('/');

  return ["20" + part[2], part[1], part[0]].join('-');
}

/**
 * Helper to set a value in a cell.
 *
 * @param sheet
 * @param cell
 * @param title
 */
function setCellValue(sheet, cell, title) {
  sheet.getRange(cell).setValue(title);
}

/**
 * Helper to return the current sheet.
 *
 * @returns {Sheet}
 */
function currentSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()[0];
}
