const chokidar = require('chokidar');
const tilde = require('tilde-expansion');
const fs = require('fs');
const exec = require('child_process').execFile;
const daily2jira = '../dailyapp2jira/index.js';

tilde('~/Documents/Enrise', dir =>
  chokidar
    .watch(dir, { ignored: /[\/\\]\.|(\.sent)/, ignoreInitial: true })
    .on('add', path => {
      console.log(path);

      exec('node', [daily2jira, path], {cwd: __dirname}, (error, stdout, stderr) => {
        console.log(stdout);
        fs.rename(path, path + '.sent', function(err) {
          if ( err ) console.log('ERROR: ' + err);
        });

        console.log('stderr: ' + stderr);
        if (error !== null) {
          console.log('exec error: ' + error);
        }
      });

  }));
