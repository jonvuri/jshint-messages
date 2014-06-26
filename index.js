
var fs = require( 'fs' )
var path = require( 'path' )

var _ = require( 'lodash' )
var rimraf = require( 'rimraf' )
var sourcetrace = require( 'sourcetrace' )

var jshintDir = process.argv[2]


function e( callback ) {

	return function ( err ) {

		if ( err ) {
			throw err
		} else {
			callback.apply( this, _.tail( arguments ) )
		}

	}

}


function filter( file ) {
	return path.extname( file ) === '.js' && path.basename( file ) !== 'messages.js'
}


function formatTrace( trace, filename, fileLines ) {

	var githubUrl = 'https://github.com/jshint/jshint/blob/master/src/'
	var lastLine = 0

	function padLineNumber( line ) {
		line = String( line )
		return line + Array( 5 - line.length ).join( ' ' )
	}

	return '<pre>' + _.reduce( trace, function ( result, line ) {

		if ( lastLine !== line - 1 ) {
			result += '…\n'
		}

		result += '<a href="' + githubUrl + filename + '#L' + line + '">'

		result += padLineNumber( line ) + ': '

		result += fileLines[ line - 1 ]

		result += '</a>\n'

	}, '' ) + '</pre>'

}


var messages = require( path.join( jshintDir, 'src', 'messages' ) )


function processMessage( dir, files, message ) {

	var code = message.code
	var desc = message.desc

	fs.writeFile( path.join( dir, code + '.md' ),
		'# ' + code + '\n' + desc + '\n' +
		_.reduce( files, function ( result, file, filename ) {

			console.log( code + ' - ' + filename )

			var trace, lines

			try {
				var traces = sourcetrace( '"' + code + '"', file )
			} catch (e) {
				e.message = 'Error reading ' + filename + ':\n' + e.message
				throw e
			}

			if ( traces.length ) {

				lines = file.split( '\n' )

				result += _.map( traces, function ( trace ) {
					return '\n' + '## ' + filename + '\n' + formatTrace( trace, filename, lines )
				} ).join( '\n' )

			}

			return result

		}, '' )
	)

}


function done( files ) {

	rimraf( 'errors', e( function () {
		fs.mkdir( 'errors', e( function () {
			_.each( messages.errors, _.curry( processMessage )( 'errors' )( files ) )
		} ) )
	} ) )

	rimraf( 'warnings', e( function () {
		fs.mkdir( 'warnings', e( function () {
			_.each( messages.warnings, _.curry( processMessage )( 'warnings' )( files) )
		} ) )
	} ) )

}


fs.readdir( path.join( jshintDir, 'src' ), e( function ( files ) {

	files = _.filter( files, filter )

	var filestrings = {}

	var doneFn = _.after( files.length, done )

	_.each( files, function ( file ) {

		fs.readFile( path.join( jshintDir, 'src', file ), 'utf8', e( function ( filestring ) {

			filestrings[ file ] = filestring

			doneFn( filestrings )

		} ) )

	} )

} ) )
