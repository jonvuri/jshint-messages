'use strict'

var fs = require( 'fs' )
var path = require( 'path' )

var _ = require( 'lodash' )
var mustache = require( 'mustache' )
var rimraf = require( 'rimraf' )
var sourcetrace = require( 'sourcetrace' )


var jshintDir = process.argv[2]

if ( !jshintDir ) {
	throw new Error( 'Usage: jshint-messages [jshint dir]' )
}

var messages = require( path.join( jshintDir, 'src', 'messages' ) )

var base = fs.readFileSync( 'base.html', 'utf8' )



// For async funcs, throw any error or continue with callback
function e( callback ) {

	return function ( err ) {

		if ( err ) {
			throw err
		} else {
			callback.apply( this, _.tail( arguments ) )
		}

	}

}



function done( files ) {

	function process( message ) {
		rimraf( message, e( function () {
			fs.mkdir( message, e( function () {
				_.each( messages[message], _.curry( writeMessage )( message )( files ) )
			} ) )
		} ) )
	}

	process( 'errors' )
	process( 'warnings' )
	process( 'info' )

}


function writeMessage( dir, files, message ) {

	process.stdout.write( message.code + ' ' )

	fs.writeFile( path.join( dir, message.code + '.md' ), processMessage( message, files ) )

}


function processMessage( message, files ) {

	var traces
	var fileLines
	var options

	traces = _.map( files, function ( file, filename ) {

		var fileTraces

		try {
			fileTraces = sourcetrace( '"' + message.code + '"', file )
		} catch (e) {
			e.message = 'Error tracing ' + filename + ':\n' + e.message
			throw e
		}


		function num( a, b ) {
			return a - b
		}

		return {
			trace: _.uniq( _.flatten( fileTraces ).sort( num ), true ),
			filename: filename
		}

	} )

	fileLines = _.mapValues( files, function (file) { return file.split( '\n' ) } )

	options = _.reduce( traces, function ( result, trace ) {

		var filename = trace.filename
		var lines = fileLines[filename]

		_.each( trace.trace, function ( line ) {

			var fileLine = lines[ line - 1 ]
			var optionRegex = /state\.option\.([a-zA-Z_$][0-9a-zA-Z_$]*)/g
			var regexResult

			if ( _.contains( fileLine, 'state.option' ) ) {

				while ( ( regexResult = optionRegex.exec( fileLine ) ) !== null ) {
					result.push( regexResult[1] )
				}

			}

		} )

		return result

	}, [] )


	return template( message, fileLines, options, traces )

}


function template( message, fileLines, options, traces ) {

	function padLineNumber( line ) {

		var padLength = 4

		line = String( line )

		return line + Array( padLength - line.length + 1 ).join( ' ' )

	}

	return mustache.render( base, {
		message: message,
		fileLines: fileLines,
		options: options,
		traces: _(traces).map( function ( trace ) {

			var lines = fileLines[ trace.filename ]

			var lastline = null

			return {
				trace: _.map( trace.trace, function ( line ) {

					var cont

					if ( lastline ) {
						cont = line === lastline + 1
					} else {
						cont = true
					}

					lastline = line

					return {
						continuous: cont,
						lineNumber: line,
						paddedLineNumber: padLineNumber( line ),
						lineText: lines[ line - 1 ].replace( /\s+$/g, '' )
					}

				} ),
				filename: trace.filename
			}

		} ).filter( function ( trace ) {
			return !_.isEmpty( trace.trace )
		} ).value()
	} )

}



fs.readdir( path.join( jshintDir, 'src' ), e( function ( filepaths ) {

	filepaths = _.filter( filepaths, function ( file ) {
		return path.extname( file ) === '.js' && path.basename( file ) !== 'messages.js'
	} )

	var files = {}

	var doneFn = _.after( filepaths.length, done )

	_.each( filepaths, function ( file ) {

		fs.readFile( path.join( jshintDir, 'src', file ), 'utf8', e( function ( contents ) {

			files[ file ] = contents

			doneFn( files )

		} ) )

	} )

} ) )



process.on( 'exit', function () {
	process.stdout.write( '\n' )
})
