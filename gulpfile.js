
var DEBUG = false; // false for prod builds

var shelljs = require('shelljs');
var gulp = require('gulp');
var util = require('gulp-util');
var uglify = require('gulp-uglify');
var gulpif = require('gulp-if');
var concat = require('gulp-concat');

var browserify = require('browserify');
var babelify = require('babelify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var fs = require('fs');

var cmdParams = process.argv.slice(2);
util.log("Command params received: ", cmdParams);

//--------------------------
// Sample Apps code changes
//--------------------------
var _ = require('underscore');
var sampleAppPlatform = cmdParams[2];
if(sampleAppPlatform) {
	sampleAppPlatform = sampleAppPlatform.toLowerCase();
}

// if(!["tizen", "lgwebos", "viziosmartcast", "xbox"].includes(sampleAppPlatform)) {
// 	util.log("INVALID platform");
// 	return;
// }

gulp.task('SAMPLEAPP', ['SAMPLEAPP_HTML', 'SAMPLEAPP_CSS'], function () {

	var b = browserify({
		"basedir": "./src",
		"entries": [sampleAppPlatform + "/" + sampleAppPlatform + ".init.js"],
		"debug": false,
		"paths": [".",
			"common"]
	}).transform(babelify, {
		// Use all of the ES2015 spec
		presets: ['es2015']
	});

	copyFiles("src/" + sampleAppPlatform + "/" + sampleAppPlatform + "-integration-sample.js", "./dist/apps/" + sampleAppPlatform + "/");

	return b.bundle()
		.on('error', function (err) {
			util.log(util.colors.red.bold('ERROR: ' + err.message));
			this.emit('end');
		})
		.pipe(source('bundle.js'))
		.pipe(buffer())
		.pipe(gulpif(!DEBUG, uglify({
			output: {}, // output options
			compress: {},  // compress options
			mangle: false
		})))
		.pipe(gulp.dest('./dist/apps/' + sampleAppPlatform));
});

gulp.task('SAMPLEAPP_HTML', function () {

	createDirectory();

	var generatedHtml;

	// BUILD INDEX.HTML FILE HERE
	switch (sampleAppPlatform) {
		case 'viziosmartcast':
			var vizioAppConfig = require('./platformconfig/viziosmartcast.json');
			generatedHtml = generateHtmlStr('src/index.template.html', vizioAppConfig);
			break;
		case 'tizen':
			var tizenAppConfig = require('./platformconfig/tizen.json');
			generatedHtml = generateHtmlStr('src/index.template.html', tizenAppConfig);
			break;
		case 'xbox':
			var xboxAppConfig = require('./platformconfig/xbox.json');
			generatedHtml = generateHtmlStr('src/index.template.html', xboxAppConfig);
			break;
	}

	// Write generated html string to a file
	fs.writeFileSync("./dist/apps/" + sampleAppPlatform + "/index.html", generatedHtml);

});

gulp.task('SAMPLEAPP_CSS', function () {

	return gulp.src("src/common/css/*")
		.pipe(concat('style.css'))
		.pipe(gulp.dest("./dist/apps/" + sampleAppPlatform + "/css/"));
});

//--------------------------
// Sample Apps code changes
//--------------------------

function generateHtmlStr(htmlPath, inputData) {

	var htmlStr = fs.readFileSync(htmlPath, "utf8");
	if (htmlStr) {
		var compiled = _.template(htmlStr);
		var updatedHtmlStr = compiled(inputData);
		return updatedHtmlStr;
	} else {
		util.log(util.colors.red.bold('ERROR: No HTML input available'));
		process.exit(1);
	}
}

function createDirectory() {
	if (!fs.existsSync("./dist/apps/" + sampleAppPlatform)) {
		console.info("Dist does not exist...");
		// creates full path
		shelljs.mkdir('-p', './dist/apps/' + sampleAppPlatform);
	} else {
		console.info("Dist exists...");
	}
}

function copyFiles(src, dest, replaceAppId) {

	if (replaceAppId) {

		gulp.src(src)
			.pipe(replace(/VIZBEE_APP_ID/g, taskConfig.receivers[app][platform.toLowerCase()]))
			.pipe(gulp.dest(dest));
	} else {

		gulp.src(src)
			.pipe(gulp.dest(dest));
	}
}

/***** DEFAULT TASK *****/
gulp.task('default', function () {
	console.log('\n');
	console.log('Vizbee Sample App Build Manager\n');
	console.log('Build Sample App:\n');
	console.log('\tgulp SAMPLEAPP --platform <PLATFORM>');
	console.log('\t\tOptions:');
	console.log('\t\t\tPLATFORM=["tizen"|"lgwebos"|"viziosmartcast"|"xbox"]\n');
	console.log('\t--------');
	console.log('\tExample:');
	console.log('\t--------');
	console.log('\tgulp SAMPLEAPP --platform tizen ==> Builds Sample Vizbee App for Samsung Tizen TV\n');
	console.log('\tgulp SAMPLEAPP --platform viziosmartcast ==> Builds Sample Vizbee App for Vizio SmartCast TV\n');
});