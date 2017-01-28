'use strict';

module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('default', [ 'browserify', 'uglify' ]);

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    browserify: {
      options: {
        expose: 'jsoncompress'
      },
      main: {
        src: ['jsoncompress.js'],
        dest: 'browser/jsoncompress.js'
      }
    },
    uglify: {
      main: {
        files: {
          'browser/jsoncompress.min.js': [ 'browser/jsoncompress.js' ]
        }
      }
    }
  });
};
