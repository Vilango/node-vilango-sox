var childProcess = require('child_process')
  , EventEmitter = require('events').EventEmitter
  , Batch = require('batch')
  , util = require('util')
  , temp = require('temp')
  , fs = require('fs');

var rimraf     = require('rimraf'),
    rimrafSync = rimraf.sync;


exports.identify = identify;
exports.transcode = transcode;
exports.transcodeStream = transcodeStream;

var SENTINEL = /[\n\r]/

// to edit this see https://gist.github.com/4142076
var PROGRESS_TIME_REGEX = /^In:([\d.]+)%\s+(\d\d):(\d\d):([\d.]+)\s+\[(\d\d):(\d\d):([\d.]+)\]\s+Out:([\d.\w]+)\s+\[[\s|\-!=]+\]\s+(?:Hd:([\d.]+))?\s+Clip:(\d+)\s*$/;

var conversions = {
  sampleRate: int,
  sampleCount: int,
  channelCount: int,
  duration: float,
  bitRate: parseBitRate,
}
var suffixMultiplier = {
  'k': 1024,
  'm': 1024 * 1024,
  'g': 1024 * 1024 * 1024,
};
function parseBitRate(str) {
  var mult = suffixMultiplier[str[str.length - 1]];
  var n = parseInt(str, 10);
  return mult ? mult * n : n;
}

function capture(exe, args, callback){
  childProcess.execFile(exe, args, function(err, stdout, stderr){
    if (err) {
      err.stdout = stdout;
      err.stderr = stderr;
      err.args = args;
      callback(err);
    } else {
      callback(null, stdout.trim());
    }
  });
}

function int(it){
  return parseInt(it, 10);
}

function float(it){
  return parseFloat(it, 10);
}

function identify(inputFile, callback){
  var results = {}
    , batch = new Batch()

  soxInfo('-t', function(value) { results.format        = value; });
  soxInfo('-r', function(value) { results.sampleRate    = value; });
  soxInfo('-c', function(value) { results.channelCount  = value; });
  soxInfo('-s', function(value) { results.sampleCount   = value; });
  soxInfo('-D', function(value) { results.duration      = value; });
  soxInfo('-B', function(value) { results.bitRate       = value; });

  batch.end(function(err) {
    if (err) return callback(err);
    for (var k in conversions) {
      results[k] = conversions[k](results[k])
    }
    callback(null, results);
  });

  function soxInfo(arg, assign) {
    batch.push(function(cb) {
      capture('sox', ['--info', arg, inputFile], function(err, value) {
        if (err) return cb(err);
        assign(value);
        cb();
      });
    });
  }
}


function transcodeStream(inputStream, outputStream, options) {
  if (!(inputStream && outputStream)) {
    console.log("We do not have all streams", inputStream, outputStream);
    return;
  }

  return new TranscodeStream(inputStream, outputStream, options)
}

function TranscodeStream(inputStream, outputStream, options){
  var self = this;
  EventEmitter.call(this);

  var origFile = temp.createWriteStream();
  inputStream.pipe(origFile);

  origFile.on("close", function(){
    //console.log("we got the temp file", origFile.path+"");
    var format = options.format || 'mp3';

    var convertedFile = origFile.path+"."+ format;


    var t = new Transcode(origFile.path+"", convertedFile, options);
    t.on("error", function(err) {
      self.emit('error', err);
    });

    t.on("progress", function(amountDone, amountTotal) {
      self.emit('progress', amountDone, amountTotal);
    });

    t.on("src", function(info) {
      self.emit('src', info);
    });

    t.on("dest", function(info) {
      self.emit('dest', info);
    });

    t.on("end", function() {
      // we are done... now we have to stream back
      var outStream = fs.createReadStream(convertedFile);
      outStream.pipe(outputStream);

      outStream.on('close', function() {
        rimrafSync(origFile.path)
        rimrafSync(convertedFile)

        self.emit('end');
      });
    });
    t.start();
  });
}
util.inherits(TranscodeStream, EventEmitter);

function transcode(inputFile, outputFile, options) {
  return new Transcode(inputFile, outputFile, options);
}

function Transcode(inputFile, outputFile, options) {
  EventEmitter.call(this);
  this.inputFile = inputFile;
  this.outputFile = outputFile;
  this.options = options;

  // defaults
  this.options = this.options || {};
  this.options.sampleRate = this.options.sampleRate || 44100;
  this.options.format = this.options.format || 'mp3';
  this.options.channelCount = this.options.channelCount || 2;
  this.options.bitRate = this.options.bitRate ? parseInt(this.options.bitRate, 10) : 192 * 1024;
  if (this.options.format === 'mp3') {
    this.options.compressionQuality = this.options.compressionQuality || 5;
  }

  this.options.effectsArray = []
  for (var effect in this.options.effects) {
    //console.log("effect", effect, this.options.effects[effect]);
    this.options.effectsArray.push(effect);
    this.options.effectsArray.push(this.options.effects[effect]);
  }
}

util.inherits(Transcode, EventEmitter);

Transcode.prototype.start = function() {
  var self = this;
  identify(this.inputFile, function(err, src) {
    if (err) {
      self.emit('error', err);
      return
    }

    self.emit('src', src);
    
    var compression = ""
    if (self.options.compressionQuality) {
      compression = '-C '+ (Math.round(self.options.bitRate / 1024) + self.options.compressionQuality)  
    }
    

    var args = [
      '--guard',
      //'--magic',
      '--show-progress',
      self.inputFile,
      '-r', self.options.sampleRate+"",
      '-t', self.options.format,
      compression,
      '-c '+ self.options.channelCount,
      self.outputFile
    ];
    args = args.filter(Boolean)

    if (self.options.effectsArray.length > 0) {
      args = args.concat(self.options.effectsArray)
    }

    var bin = childProcess.spawn('sox', args);
    var stdout = "";
    bin.stdout.setEncoding('utf8');
    bin.stdout.on('data', function(data) {
      stdout += data;
    });
    var stderr = "";
    var buffer = "";
    bin.stderr.setEncoding('utf8');
    bin.stderr.on('data', function(data) {
      stderr += data;
      buffer += data;
      var lines = buffer.split(SENTINEL);
      buffer = lines.pop();
      lines.forEach(function(line) {
        var m = line.match(PROGRESS_TIME_REGEX);
        if (!m) return;
        var hour = parseInt(m[2], 10)
        var min = parseInt(m[3], 10)
        var sec = parseInt(m[4], 10)
        var encodedTime = sec + min * 60 + hour * 60 * 60;
        // might have to correct duration now that we've scanned the file
        if (encodedTime > src.duration) {
          src.duration = encodedTime;
          self.emit('src', src);
        }
        self.emit('progress', encodedTime, src.duration);
      });
    });
    bin.on('close', function(code) {
      if (code) {
        var err = new Error("sox returned nonzero exit code: " + code);
        err.code = code;
        err.stdout = stdout;
        err.stderr = stderr;
        err.args = args;
        self.emit('error', err);
      } else {
        identify(self.outputFile, function(err, dest) {
          if (err) {
            self.emit('error', err);
          } else {
            self.emit('dest', dest);
            self.emit('progress', src.duration, src.duration);
            self.emit('end');
          }
        });
      }
    });
  });
};
