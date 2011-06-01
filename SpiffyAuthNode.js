/*
 * Load modules
 */
var sys = require('sys'),  
    http = require('http'),  
    url = require('url'),  
    path = require('path'),  
    fs = require('fs');  

/*
 * Constants
 */
var port = 8181;
var targetDir = '/target/www';
var i18nDir = '/js/lib/i18n/';
var authUri = '/auth';
/*
 * Global variables
 */
var resources;
var tokens = [];
/*
 * Create the HTTP server
 */
var server = http.createServer(function(request, response) {  
    /*
     * Handle based on the URI
     */
	var uri = url.parse(request.url).pathname;
    
    /*
     * Try to find a static file that matches the 
     * current working directory/target/www/file name
     * 
     * (process.cwd() gets the current working directory)
     */
    var filename = path.join(process.cwd(), targetDir, uri);  
    path.exists(filename, function(exists) {  
    	/*
    	 * If there's no file, it could be the REST call or
    	 * an internationalized date JavaScript file or
    	 * 404
    	 */
        if (!exists) {  
            if (uri.indexOf('/simple/') === 0) {   
            	if (isAuth(request.headers['authorization'])) {
                    /*
                     * This is the REST call!
                     */
                	var user = uri.substring(8);
                    var userAgent = request.headers['user-agent'];
                    var payload = {user: user, userAgent: userAgent, serverInfo: 'Node.js'};                                        
                    response.writeHeader(200, {'Content-Type': 'application/json'});  
                    response.end(JSON.stringify(payload));  
                    return;            		
            	} else {
            		/*
            		 * Return the unauthenticated NCAC Fault and include the header for authentication
            		 */
            		response.writeHeader(401, {'Content-Type': 'application/json', 
            			'WWW-Authenticate': 'X-OPAQUE uri="http://localhost:8181/auth", signOffUri=""'});  
            		var ncacFault = {'Fault': {'Code': {'Value': 'Sender', 'Subcode': {'Value': 'NoAuthHeader'}}, 'Reason': {'Text':''}}};
            		response.end(JSON.stringify(ncacFault)); 
            		return;
            	}
            } else if (uri == authUri) {
            	if (request.method === 'POST') {
                	/*
                	 * Any username and password combination is fine, return the token, which is just the timestamp
                	 */
            		var token = '' + new Date().getTime()
                	var json = {'Token': token};
                	tokens.push(token);
                	response.writeHeader(200, {'Content-Type': 'application/json'});  
                	response.end(JSON.stringify(json)); 
            		return;            		
            	} else if (request.method === 'DELETE') {
            		var authHeader = request.headers['authorization'];
            		removeToken(authHeader);
            		response.writeHeader(200, {'Content-Type': 'application/json'});  
            		var json = {'Status': 'OK'};
            		response.end(JSON.stringify(json));
            		return;
            	}
            
            } else if (uri === i18nDir + 'date' || uri === i18nDir + 'jquery.ui.datepicker.js') {
            	/* 
            	 * This is a internationalized file request!
            	 */
            	var resource  = getI18nDateResource(request, uri);
            	filename = path.join(process.cwd(), targetDir, i18nDir, resource);
            	/*
            	 * Do not return -- let it get the correct i18n date file below
            	 */
            	
            } else {
            	/*
            	 * 404!
            	 */
                response.writeHeader(404, {'Content-Type': 'text/plain'});  
                response.end('404 Not Found\n'); 
                return;
            }
        }  
        
        /*
         * Serve up the static file that is in /target/www
         */
        
        if (('' + filename.match('/www/$')) === '/www/') {
            // Then this is a request for the root and we'll return the index.html file
            filename += 'index.html';
        }
                
        fs.readFile(filename, 'binary', function(err, file) {  
            if(err) {  
                response.writeHeader(500, {'Content-Type': 'text/plain'});  
                response.end(err + '\n');  
                return;  
            }  
            
            response.writeHeader(200);  
            response.write(file, 'binary');  
            response.end();  
        }); //end fs.readFile callback
    }); //end path.exists callback
}); 

/*
 * Load all the internationalized resources by reading the i18n directory
 */
fs.readdir(path.join(process.cwd(), targetDir,  i18nDir), function(err, files) {
	resources = files;
	
	/*
	 * After resources are retrieved then the server can listen
	 */
	server.listen(port);
	
	sys.puts('========================================================================\n');
	sys.puts('Access Hello Spiffy Node Auth at http://localhost:' + port + '\n');
	sys.puts('========================================================================\n');

});

/**
 * Return the internationalized date file name
 * @param request - the http request
 * @param uri - the uri of the request
 * @returns {String} - the file name
 */
function getI18nDateResource(request, uri) {
	var resourceName = uri.substring(uri.lastIndexOf('/') + 1);
	if (resourceName === 'jquery.ui.datepicker.js') {
		resourceName = 'jquery.ui.datepicker';
	}

	/*
	 * Check for the file with the matching locale
	 */
	var langs = request.headers['accept-language'];
	var locales = langs.split(',');
	
	for (i in locales) {
		var locale = locales[i];
		/*
		 * Trim off ";q=0.3", if exists
		 */
		var loc = locale.indexOf(';') > 0 ? locale.substring(0, locale.indexOf(';')) : locale;
		
		/*
		 * Capitalize the country to match file name, if exists
		 */
		var langCountry = loc.split('-');
		if (langCountry.length === 2) {
			langCountry[1] = langCountry[1].toUpperCase();			
			//rejoin loc
			loc = langCountry.join('-');
		}
		
		var resource = resourceName + '-' + loc + '.js';
		if (resourceExists(resource)) {
			return resource;
		} else {
			/*
			 * Try just on country
			 */
			resource = resourceName + '-' + langCountry[0] + '.js';
			if (resourceExists(resource)) {
				return resource;
			}
		}
		/*
		 * Hasn't found a match, so try next locale
		 */
	}
	/*
	 * No matches, return default
	 */
	return resourceName + '-en.js';
}

/**
 * Check if the resource is in the resources global variable
 * @param resource to test
 * @returns {Boolean} true if found
 */
function resourceExists(resource) {
	for (i in resources) {
		if (resources[i] === resource) {
			return true;
		}
	}
	return false;
}

/**
 * Checks if the request has a token
 * @param authHeader the Authorization header
 * @returns {Boolean} true if exists
 */
function isAuth(authHeader) {
	if (authHeader != null) {
		for (i in tokens) {
			if ('X-OPAQUE ' + tokens[i] === authHeader) {
				return true;
			}
		}
	}
	return false;
}

function removeToken(authHeader) {
	if (authHeader != null) {
		for (i in tokens) {
			if ('X-OPAQUE ' + tokens[i] === authHeader) {
				tokens.splice(i, 1);
				return;
			}
		}
	}
}