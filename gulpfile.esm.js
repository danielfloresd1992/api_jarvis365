import gulp from 'gulp';
import pug from 'gulp-pug';
import rename from 'gulp-rename';

// Compile pug templates and copy them to dist/view
function buildViews() {
    return gulp
        .src('src/view/**/*.pug')
        .pipe(gulp.dest('dist/view'));
}

// Copy any static assets that Babel doesn't handle
function copyAssets() {
    return gulp
        .src(['src/**/*.json', 'src/**/*.html', 'src/**/*.css', 'src/**/*.pug'], { base: 'src' })
        .pipe(gulp.dest('dist'));
}

const build = gulp.parallel(buildViews, copyAssets);

export { build };
export default build;
