var fs = require("fs");
var browserify = require("browserify");
var babelify = require("babelify");

browserify({ debug: true })
    .transform(babelify.configure({ presets: ["@babel/preset-env"] }))
    .require("./src/background.js", { entry: true })
    .bundle()
    .on("error", function (err) { console.log("Error: " + err.message); })
    .pipe(fs.createWriteStream("./build/background.js"));
