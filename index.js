'use strict'

var fs = require( 'fs' )
var path = require( 'path' )

var _ = require( 'lodash' )
var rimraf = require( 'rimraf' )
var sourcetrace = require( 'sourcetrace' )


var jshintDir = process.argv[2]

var messages = require( path.join( jshintDir, 'src', 'messages' ) )



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



function formatTrace( trace, filename, fileLines ) {

	var githubUrl = 'https://github.com/jshint/jshint/blob/master/src/'
	var lastline

	function padLineNumber( line ) {
		line = String( line )
		return line + Array( 5 - line.length ).join( ' ' )
	}

	return '<pre>' + _.reduce( trace, function ( result, line ) {

		if ( lastline && lastline !== line - 1 ) {
			result += '…\n'
		}

		lastline = line

		result += '<a href="' + githubUrl + filename + '#L' + line + '">'

		result += padLineNumber( line ) + ': '

		result += fileLines[ line - 1 ].replace( /\s+$/g, '' )

		result += '</a>\n'

		return result

	}, '' ) + '</pre>\n'

}


function formatMessage( files, message ) {

	var traces = _.mapValues( files, function ( file, filename ) {

		var fileTraces

		try {
			fileTraces = sourcetrace( '"' + message.code + '"', file )
		} catch (e) {
			e.message = 'Error tracing ' + filename + ':\n' + e.message
			throw e
		}

		return _.uniq( _.flatten( fileTraces ) )

	} )

	var fileLines = _.mapValues( files, function (file) { return file.split( '\n' ) } )

	var options = _.reduce( traces, function ( result, trace, filename ) {

		var lines = fileLines[filename]

		_.each( trace, function ( line ) {

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


	var result = ''

	result += '# ' + message.code + '\n\n'

	result += '###### ' + ( message.desc || '*Retired message - No description*' ) + '\n\n'

	if ( options.length ) {

		result += '## Affecting options\n\n'

		result += _.map( options, function ( option ) {
			return '<a href="http://www.jshint.com/docs/options/#' + option + '">' + option + '</a>'
		} ).join( '\n' ) + '\n\n'
	}

	if ( _.any( traces, function ( trace ) { return !_.isEmpty( trace ) } ) ) {

		result += '## Source\n\n'

		result += _( traces ).pick( function ( trace ) {
			return !_.isEmpty( trace )
		} ).map( function ( trace, filename ) {
			return '### ' + filename + '\n' + formatTrace( trace, filename, fileLines[filename] ) + '\n\n'
		} ).join( '\n' )

	}

	return result

}



function processMessage( dir, files, message ) {

	process.stdout.write( message.code + ' ' )

	fs.writeFile( path.join( dir, message.code + '.md' ), formatMessage( files, message ) )

}


function done( files ) {

	function process( message ) {
		rimraf( message, e( function () {
			fs.mkdir( message, e( function () {
				_.each( messages[message], _.curry( processMessage )( message )( files ) )
			} ) )
		} ) )
	}

	process( 'errors' )
	process( 'warnings' )
	process( 'info' )

}



fs.readdir( path.join( jshintDir, 'src' ), e( function ( filepaths ) {

	filepaths = _.filter( filepaths, function ( file ) {
		return path.extname( file ) === '.js' && path.basename( file ) !== 'messages.js'
	} )

	var files = {}

	var doneFn = _.after( filepaths.length, done )

	_.each( filepaths, function ( file ) {

		fs.readFile( path.join( jshintDir, 'src', file ), 'utf8', e( function ( filestring ) {

			files[ file ] = filestring

			doneFn( files )

		} ) )

	} )

} ) )



process.on( 'exit', function () {
	process.stdout.write( '\n' )
})
