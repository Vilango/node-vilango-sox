var sox = require('../')
  , assert = require('assert')
  , path = require('path')
  , mkdirp = require('mkdirp')
  , rimraf = require('rimraf')
  , soundWav = path.join(__dirname, 'sound.wav')
  , soundMp3 = path.join(__dirname, 'sound.mp3')
  , tmpDir = path.join(__dirname, 'tmp')
  , outputMp3 = path.join(tmpDir, 'output.mp3')
  , fs = require('fs')
  , temp = require('temp');

var rimraf     = require('rimraf'),
  rimrafSync = rimraf.sync;


describe("sox", function () {
  describe("identify", function () {
    it("wav", function(done) {
      sox.identify(soundWav, function (err, results) {
        if (err) return done(err);
        assert.deepEqual(results, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
        done();
      });
    });
    it("mp3", function(done) {
      sox.identify(path.join(__dirname, 'sound.mp3'), function (err, results) {
        if (err) return done(err);
        assert.deepEqual(results, {
          format: 'mp3',
          duration: 1.070998,
          sampleCount: 47231,
          channelCount: 1,
          bitRate: 132096,
          sampleRate: 44100,
        });
        done();
      });
    });
  });
  describe("transcode", function() {
    before(function(done) {
      mkdirp(tmpDir, done);
    });
    it("wav -> mp3", function(done) {
      var transcode = sox.transcode(soundWav, outputMp3);
      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'mp3',
          channelCount: 2,
          sampleCount: 67958,
          duration: 1.540998,
          bitRate: 196608,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);
        done();
      });
      transcode.start();
    });
    after(function(done) {
      rimraf(tmpDir, done);
    });
  });
  describe("transcodeStream", function() {
    it("wav -> mp3", function(done) {
      var readStream = fs.createReadStream(soundWav);
      var tempOutputFile = temp.path({suffix: '.mp3'})
      console.log("tempOutputFile", tempOutputFile);
      //var tempOutputFile = path.join(__dirname, 'sound.temp.mp3')
      var writeStream = fs.createWriteStream(tempOutputFile);

      var transcode = sox.transcodeStream(readStream, writeStream, {
        format: 'mp3', bitRate: 64*1024, effects: { speed: 0.6, pitch: 850 }
      });

      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'mp3',
          channelCount: 2,
          sampleCount: 111749,
          duration: 2.533991,
          bitRate: 65536,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);

        //console.log(tempOutputFile);
        var filesize = fs.statSync(tempOutputFile).size
        assert( filesize == 20271, "expected size 20271. got: "+filesize );
        //rimrafSync(tempOutputFile);
        done();
      });
    });
    it("wav -> ogg", function(done) {
      var readStream = fs.createReadStream(soundWav);
      var tempOutputFile = temp.path({suffix: '.ogg'})
      console.log("tempOutputFile", tempOutputFile);
      //var tempOutputFile = path.join(__dirname, 'sound.temp.mp3')
      var writeStream = fs.createWriteStream(tempOutputFile);

      var transcode = sox.transcodeStream(readStream, writeStream, {
        format: 'ogg', bitRate: 64*1024, effects: { speed: 0.6, pitch: 850 }
      });

      transcode.on('error', function(err) {
        console.dir(err);
        done(err);
      });
      var progress = 0;
      var progressEventCount = 0;
      transcode.on('progress', function(amountDone, amountTotal) {
        var newProgress = amountDone / amountTotal;
        progressEventCount += 1;
        assert(newProgress >= progress);
        progress = newProgress;
      });
      var gotSrc = false;
      transcode.on('src', function(info) {
        gotSrc = true;
        assert.deepEqual(info, {
          format: 'wav',
          duration: 1.5,
          sampleCount: 66150,
          channelCount: 1,
          bitRate: 722944,
          sampleRate: 44100,
        });
      });
      var gotDest = false;
      transcode.on('dest', function(info) {
        gotDest = true;
        assert.deepEqual(info, {
          sampleRate: 44100,
          format: 'vorbis',
          channelCount: 2,
          sampleCount: 110250,
          duration: 2.5,
          bitRate: 36864,
        });
      });
      transcode.on('end', function() {
        assert(gotSrc);
        assert(gotDest);
        assert.strictEqual(progress, 1);
        assert(progressEventCount >= 3, "expected at lesat 3 progress events. got: " + progressEventCount);

        //console.log(tempOutputFile);
        var filesize = fs.statSync(tempOutputFile).size
        assert( (filesize >= 11300 && filesize <= 11400), "expected size 11355. got: "+filesize );
        //rimrafSync(tempOutputFile);
        done();
      });
    });
  });

});
