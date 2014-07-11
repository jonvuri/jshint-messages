'use strict'

var fs = require( 'fs' )
var path = require( 'path' )

var async = require( 'async' )
var _ = require( 'lodash' )
var mustache = require( 'mustache' )
var rimraf = require( 'rimraf' )
var sourcetrace = require( 'sourcetrace' )


var jshintDir = process.argv[2]

if ( !jshintDir ) {
	throw new Error( 'Usage: jshint-messages [jshint dir]' )
}

var messages = require( path.join( jshintDir, 'src', 'messages' ) )

var base = fs.readFileSync( 'base.md.mst', 'utf8' )




function writeMessage( dir, files, templates, message ) {

	process.stdout.write( message.code + ' ' )

	fs.writeFile( path.join( 'out', dir, message.code + '.md' ), processMessage( message, files, templates[ message.code ] ) )

}


function processMessage( message, files, template ) {

	var traces
	var fileLines
	var options


	function normalizeOption( option ) {

		if ( option.indexOf( 'in' ) === 0 && option !== 'indent' ) {
			option = option.slice( 2 ).toLowerCase()
		}

		if ( option === 'es5' ) {
			option = 'es3'
		}

		return option

	}



	fileLines = _.mapValues( files, function ( file ) {
		return file.split( '\n' )
	} )


	traces = _.map( files, function ( file, filename ) {

		var lastline = null
		var messagelines = []


		// Array of arrays, source lines leading to message usage: [ [ 1, 3, 5 ] ]
		var lines = sourcetrace( '"' + message.code + '"', file )


		_.each( lines, function ( trace ) {

			if ( trace.length ) {
				messagelines.push( trace[ trace.length - 1 ] )
			}

		} )

		messagelines = _.sortBy( messagelines, _.identity )


		lines = _( lines )
			.flatten()
			.sortBy( _.identity )
			.uniq( true )
			.map( function ( line, index, lines ) {

				var continuous

				if ( lastline ) {
					continuous = line === lastline + 1
				} else {
					continuous = true
				}

				lastline = line

				return {
					continuous: continuous,
					lineNumber: line,
					paddedLineNumber: String( line ) + Array( 5 - String( line ).length ).join( ' ' ),
					lineText: fileLines[ filename ][ line - 1 ].replace( /\s+$/g, '' ),
					messageLine: _.indexOf( messagelines, line, true ) !== -1
				}

			} )
			.value()


		return {
			traceLines: lines,
			filename: filename
		}

	} ).filter( function ( trace ) {
		return !_.isEmpty( trace.traceLines )
	} )


	options = _.uniq( _.reduce( traces, function ( result, trace ) {

		var filename = trace.filename
		var lines = fileLines[ filename ]

		_.each( trace.traceLines, function ( line ) {

			var fileLine = lines[ line - 1 ]
			var optionRegex = /state\.option\.([a-zA-Z_$][0-9a-zA-Z_$]*)/g
			var regexResult

			if ( _.contains( fileLine, 'state.option' ) ) {

				while ( ( regexResult = optionRegex.exec( fileLine ) ) !== null ) {
					result.push( normalizeOption( regexResult[1] ) )
				}

			}

		} )

		return result

	}, [] ) )


	return mustache.render( base, {
		message: message,
		fileLines: fileLines,
		options: options,
		traces: traces
	}, {
		content: template
	} )

}




async.auto( {

	'jshint-src-paths': function ( cb ) {

		fs.readdir( path.join( jshintDir, 'src' ), function ( err, filepaths ) {

			cb( err, _.filter( filepaths, function ( filepath ) {
				return path.extname( filepath ) === '.js' && path.basename( filepath ) !== 'messages.js'
			} ) )

		} )

	},

	'jshint-src-files': [ 'jshint-src-paths', function ( cb, results ) {

		async.map( results['jshint-src-paths'], function ( filepath, mapcb ) {

			fs.readFile( path.join( jshintDir, 'src', filepath ), 'utf8', function ( err, file ) {
				mapcb( err, [ filepath, file ] )
			} )

		}, function ( err, results ) {
			cb( err, _.object( results ) )
		} )

	} ],

	'delete-out-dir': function ( cb ) {
		rimraf( 'out', cb )
	},

	'make-out-dir': [ 'delete-out-dir', function ( cb ) {
		fs.mkdir( path.join( 'out' ), cb )
	} ],

	'make-out-subdirs': [ 'make-out-dir', function ( cb ) {

		function mkdir( type ) {
			return function ( parcb ) {
				fs.mkdir( path.join( 'out', type ), parcb )
			}
		}

		async.parallel( [ mkdir( 'errors' ), mkdir( 'warnings' ), mkdir( 'info' ) ], cb )

	} ],

	'code-templates': function ( cb ) {

		var templates = []

		function add( type ) { 

			_.each( messages[ type ], function ( message ) {

				templates.push( [
					message.code,
					path.join( 'in', type, message.code + '.md.mst' )
				] )

			} )

		}

		add( 'errors' )
		add( 'warnings' )
		add( 'info' )


		async.map( templates, function ( template, mapcb ) {
			/* eslint-disable handle-callback-err */
			/* It's not a problem if these don't exist */
			fs.readFile( template[ 1 ], 'utf8', function ( err, contents ) {
				mapcb( null, [ template[ 0 ], contents ] )
			} )
			/* eslint-enable handle-callback-err */
		}, function ( err, results ) {
			cb( err, _.object( results ) )
		} )

	}

}, function ( err, results ) {

	if ( err ) {
		throw err
	}

	var files = results[ 'jshint-src-files' ]
	var templates = results[ 'code-templates' ]

	function go( type ) {
		_.each( messages[ type ], _.curry( writeMessage )( type, files, templates ) )
	}

	go( 'errors' )
	go( 'warnings' )
	go( 'info' )

} )




process.on( 'exit', function () {
	process.stdout.write( '\n' )
})
