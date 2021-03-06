var debug = true;

function debugOutput(input, outputType){
	if (!debug) return;
	try {
		if (outputType == "log") {
			console.log(input);
		}
		else if (outputType == "trace") {
			console.trace(input);
		}
		else if (outputType == "info") {
			console.info(input);
		}
		else if (outputType == "error") {
			console.error(input);
		}
	} catch(err) {

	}
}

var terms = {};
function parseSearchInput(_terms, input) {
	debugOutput('parseSearchInput: ' + input, 'trace');
	terms = _terms;
	
	// special search term handling
	if (/\bfree\b/i.test(input) && /\bbo\b/i.test(input)) {
		// free items cannot have buyouts so let's remove the bo search term if any
		debugOutput("removing 'bo' as a special handling of 'free'", 'info');
		input = input.replace(/\bbo\b/i, "").trim();
	}

	// capture literal search terms (LST) like name="veil of the night"
	var regex = /([^\s]*[:=]\".*?\")/g;
	var lsts = input.match(regex);
	var _input = input.replace(regex, 'LST');
	var parseResult = parseSearchInputTokens(_input);
	debugOutput(parseResult, 'info');
	var i = 0;
	parseResult.queryString = parseResult.queryString.replace('LST', function (match) {
		var lst = lsts[i];
		i++;
		return lst.toLowerCase();
	});
	
	if (/^name[:=]"(.+)"$/i.test(parseResult.queryString)) {
		parseResult.queryString = parseResult.queryString
			.replace("name","info.tokenized.fullName")
			.replace("=",":");
	}
	return parseResult;
}

function parseSearchInputTokens(input, rerun) {
	var rerun = typeof rerun !== 'undefined' ?  rerun : false;
	var tokens = input.split(" ");
	debugOutput(tokens, 'trace');
	var queryTokens = [];
	var badTokens = [];
	for (i in tokens) {
		var evaluatedToken = tokens[i];
		if (!evaluatedToken) continue;
		var token = evaluatedToken.toUpperCase();
		
		if (/^(OR|AND|LST|NOT)$/i.test(token)) {
			evaluatedToken = token;
		} else {
			var isNegation = hasNegation(token);
			if (isNegation) evaluatedToken = evaluatedToken.substring(1);

			evaluatedToken = evalSearchTerm(evaluatedToken);
			debugOutput(token + '=' + evaluatedToken, 'trace');
			if (evaluatedToken) {
				if (isNegation) {
					evaluatedToken = createMissingQuery(evaluatedToken);
				} else if (hasBackTick(evaluatedToken)) {
					evaluatedToken = parseSearchInputTokens(evaluatedToken).queryString;
				}
			} else {
				badTokens.push(tokens[i]);
			}
		}
		queryTokens.push(evaluatedToken);
	}
	var queryString = queryTokens.join(" ");

	//rerun bad tokens
	debugOutput("bad Tokens: " + badTokens.join(""),"info");
	if(badTokens.length > 0 && !rerun){	
		var rerun = parseSearchInputTokens(badTokens.join(""),true)
		if(rerun['badTokens'].length>0){
			ga('send', 'event', 'Button', 'Bad Tokens', badTokens.toString());
		}
		var badTok = badTokens.slice(0);
		queryString += " " + rerun['queryString'];
		for( ind in badTok){
			var i = badTok[ind];
			console.log("i suck: " + i);
			if(rerun['badTokens'].toString().indexOf(i) == -1){
				badTokens.splice(badTokens.indexOf(i), 1);
			}
		}
	}
	return {'queryString' : queryString, 'badTokens' : badTokens};
}

function evalSearchTerm(token) {
	var result = "";
	for (regex in terms) {
		if (terms.hasOwnProperty(regex)) {
			var rgexTest = new RegExp('^(' + regex + ')$', 'i');
			var rgex = new RegExp(regex, 'i');
			var cleanToken = removeParensAndBackTick(token);
			var isNegation = hasNegation(cleanToken);
			if (isNegation) cleanToken = cleanToken.substring(1);
			var foundMatch = rgexTest.test(cleanToken);
			if (foundMatch) {
				result = terms[regex].query;
				// apply any captured regex groups
				var arr = rgex.exec(cleanToken);
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
				result = result.replace(/\$(\d+)/g, function replacer(match, p1, offset, string) {
					var filter = terms[regex].filter;
					var value = arr[p1];
					if (filter) {
						var filterFn = Function("val", filter);
						value = filterFn(value);
					}
					return value;
				});
				//result = cleanToken.replace(rgex, result);
				// escape spaces for elasticsearch
				result = escapeField(result);
				if (isNegation)  result = '-' + result;
				if (hasOpenParen(token))  result = /\(+/.exec(token)[0] + result;
				if (hasCloseParen(token)) result = result + /\)+/.exec(token)[0];
				debugOutput(cleanToken + ' + ' + rgex + '=' + result, 'trace');
				break;
			}
		}
	}
	return result;
}

function createMissingQuery(evaluatedToken) {
	if (evaluatedToken.indexOf('#') > -1) {
		var rgex = new RegExp(':.+', 'i')
		evaluatedToken = "_missing_:" + evaluatedToken.replace(rgex,"")					
	} else {
		evaluatedToken = "-" + evaluatedToken;
	}
	return evaluatedToken;
}

function removeParensAndBackTick(token) {
	var _token = token.replace(/[\(\)`]/g, "");
	return _token;
}

function hasOpenParen(token) {
	return token.startsWith('(');
}

function hasCloseParen(token) {
	return token.endsWith(')');
}

function hasBackTick(token) {
	return token.indexOf('`') != -1;
}

function hasNegation(token) {
	return token.startsWith('-');
}

function escapeField(result) {
	var res = result;
	var delimIdx = result.indexOf(':');
	if (delimIdx != -1) {
		var field = res.substr(0, delimIdx);
		res = res.replace(field, field.replace(/\s/g, '\\ '));
	}
	return res;
}

function firstKey(obj) {
	for(var key in obj) break;
 	// "key" is the first key here
 	return key;
}

function modToDisplay(value, mod) {
	if( typeof value === 'number' ) {
		mod = mod.replace('#', value);
	} else if ( typeof value === "object" ) {
		var valstr = value['min'] + '-' + value['max'] + ' (' + value['avg'] + ')';
		mod = mod.replace('#-#', valstr);
		value.has
	} else if ( typeof value === "boolean" ) {
		mod = mod;
	} else {
		debugOutput("Mod value is neither a number or an object, maybe ExileTools has a recent change? mod = " +
		mod + ", value = " + value, 'error');
	}
	return mod;
}

function buildElasticJSONRequestBody(searchQuery, _size, sortKey, sortOrder) {
	var sortObj = {}
	sortObj[sortKey] = { "order": sortOrder };
	var esBody = {
					"sort": [ sortObj ],
					"filter" : {
						"query": {
							"query_string": {
								"default_operator": "AND",
								"query": searchQuery
							}
						}	
					},
					size:_size
				};
	if(!searchQuery) delete esBody['query'];
	return esBody;
}

(function() {
	'use strict';

	var appModule = angular.module('application', [
		'elasticsearch',
		'ui.router',
		'ngAnimate',

		//foundation
		'foundation',
		'foundation.dynamicRouting',
		'foundation.dynamicRouting.animations',
		'ngclipboard',
		'duScroll'
	]);

	appModule.config(config);
	appModule.run(run);

	config.$inject = ['$urlRouterProvider', '$locationProvider'];

	function config($urlProvider, $locationProvider) {
		$urlProvider.otherwise('/');

		$locationProvider.html5Mode({
			enabled: true,
			requireBase: false
		});

		$locationProvider.hashPrefix('!');
	}

	function run() {
		FastClick.attach(document.body);
	}

	// Create the es service from the esFactory
	appModule.service('es', function (esFactory) {
		return esFactory({ host: 'http://apikey:07e669ae1b2a4f517d68068a8e24cfe4@api.exiletools.com' }); // poeblackmarketweb@gmail.com
	});

	appModule.controller('SearchController', ['$q', '$scope', '$http', '$location', 'es', function($q, $scope, $http, $location, es) {
		debugOutput('controller', 'info');
		$scope.searchInput = ""; // sample (gloves or chest) 60life 80eleres
		$scope.badSearchInputTerms = []; // will contain any unrecognized search term
		$scope.elasticJsonRequest = "";

		var httpParams = $location.search();
		debugOutput('httpParams:' + angular.toJson(httpParams, true), 'trace');
		var sortKeyDefault = 'shop.chaosEquiv';
		var sortOrderDefault = 'asc';
		var limitDefault = 50;
		if (httpParams['q']) $scope.searchInput = httpParams['q'];
		if (httpParams['sortKey'])   sortKeyDefault   = httpParams['sortKey'];
		if (httpParams['sortOrder']) sortOrderDefault = httpParams['sortOrder'];
		if (httpParams['limit'])     limitDefault     = httpParams['limit'];

		$scope.savedSearchesList = JSON.parse(localStorage.getItem("savedSearches"));
		$scope.savedItemsList = JSON.parse(localStorage.getItem("savedItems"));
		$scope.loadedOptions = JSON.parse(localStorage.getItem("savedOptions"));

		$scope.options = {
			"leagueSelect" : {
				"type": "select",
				"name": "League",
				"value": 'Perandus SC',
				"options": ["Perandus SC", "Perandus HC", "Standard", "Hardcore"]
			},
			"buyoutSelect" : {
				"type": "select",
				"name": "Buyout",
				"value": 'Buyout: Yes',
				"options": ["Buyout: Yes", "Buyout: No", "Buyout: Either"]
			},
			"verificationSelect" : {
				"type": "select",
				"name": "Verified",
				"value": 'Status: New',
				"options": ["Status: New", "Status: All", "Status: Gone"]
			},
			"searchPrefixInputs" : []
		};

		if($scope.loadedOptions) checkDefaultOptions();

		function checkDefaultOptions(){
		
			if(typeof $scope.loadedOptions.leagueSelect !== 'undefined'){
				$scope.options.leagueSelect.value = $scope.loadedOptions.leagueSelect.value;
			}
			if(typeof $scope.loadedOptions.buyoutSelect !== 'undefined'){
				$scope.options.buyoutSelect.value = $scope.loadedOptions.buyoutSelect.value;
			}
			if(typeof $scope.loadedOptions.verificationSelect !== 'undefined'){
				$scope.options.verificationSelect.value = $scope.loadedOptions.verificationSelect.value;
			}
			if (typeof $scope.loadedOptions.searchPrefixInputs !== 'undefined' && $scope.loadedOptions.searchPrefixInputs !== null) {
				$scope.options.searchPrefixInputs = $scope.loadedOptions.searchPrefixInputs;
			}
		}

		function createSearchPrefix(options){
			var searchPrefix = options['leagueSelect']['value'].replace(" ","");
			var buyout = options['buyoutSelect']['value'];
			switch(buyout){
				case "Buyout: Yes":	searchPrefix += " bo"; break;
				case "Buyout: No": searchPrefix += " nobo"; break;
				case "Buyout: Either": searchPrefix += ""; break;
			}
			switch(options['verificationSelect']['value']){
				case "Status: New":	searchPrefix += " new"; break;
				case "Status: All": searchPrefix += ""; break;
				case "Status: Gone": searchPrefix += " gone"; break;
			}
			options['searchPrefixInputs'].forEach(function(e){
				var prefix = e['value'];
				if (prefix) {
					searchPrefix += " " + prefix;	
				}
			});
			return searchPrefix;		
		}

		$scope.termsMap = {};

		var mergeIntoTermsMap = function(res){
			var ymlData = jsyaml.load(res.data);
			jQuery.extend($scope.termsMap, ymlData);
		};

		$q.all([
			$http.get('assets/terms/itemtypes.yml'),
			$http.get('assets/terms/gems.yml'),
			$http.get('assets/terms/mod-ofs.yml'),
			$http.get('assets/terms/mod-def.yml'),
			$http.get('assets/terms/mod-vaal.yml'),
			$http.get('assets/terms/attributes.yml'),
			$http.get('assets/terms/sockets.yml'),
			$http.get('assets/terms/buyout.yml'),
			$http.get('assets/terms/uniques.yml'),
			$http.get('assets/terms/basetypes.yml'),
			$http.get('assets/terms/currencies.yml'),
			$http.get('assets/terms/leagues.yml'),
			$http.get('assets/terms/seller.yml'),
			$http.get('assets/terms/mod-jewels.yml'),
			$http.get('assets/terms/mod-groups.yml')
		]).then(function (results) {
			for (var i = 0; i < results.length; i++) {
				mergeIntoTermsMap(results[i]);
			}
			if (typeof httpParams['q'] !== 'undefined') $scope.doSearch();
		});

		
		/*
			Runs the current searchInput with default sort
		*/		
		$scope.doSearch = function() {
			doActualSearch($scope.searchInput, limitDefault, sortKeyDefault, sortOrderDefault);
			ga('send', 'event', 'Button', 'Search', $scope.searchInput);
		};

		$scope.stateChanged = function() {
			debugOutput('stateChanged', 'log')
		};

		/*
			Runs the current searchInput with a custom sort
		*/
		$scope.doSearchWithSort = function(event){
			var elem = event.currentTarget;
			var sortKey = elem.getAttribute('data-sort-key');
			var sortOrder = elem.getAttribute('data-sort-order');
			var limit = 50;
			if (httpParams['limit']) limit  = httpParams['limit'];
			doActualSearch($scope.searchInput, limit, sortKey, sortOrder);
		};

		function doActualSearch(searchInput, limit, sortKey, sortOrder) {
			$scope.Response = null;
			if (limit > 999) limit = 999; // deny power overwhelming
			var finalSearchInput = searchInput + ' ' + createSearchPrefix($scope.options);
			finalSearchInput = finalSearchInput.trim();
			$location.search({'q' : searchInput, 'sortKey': sortKey, 'sortOrder': sortOrder, 'limit' : limit});
			$location.replace();
			debugOutput('changed location to: ' + $location.absUrl(), 'trace')
			var parseResult = parseSearchInput($scope.termsMap, finalSearchInput);
			var searchQuery = parseResult.queryString;
			$scope.badSearchInputTerms = parseResult.badTokens;
			debugOutput("searchQuery=" + searchQuery, 'log');
			
			var esBody = buildElasticJSONRequestBody(searchQuery, limit, sortKey, sortOrder);
			$scope.elasticJsonRequest = angular.toJson(esBody, true);
			debugOutput("Final search json: " +  $scope.elasticJsonRequest, 'info');
			
			es.search({
				index: 'index',
				body: esBody
			}).then(function (response) {
				$.each(response.hits.hits, function( index, value ) {
					addCustomFields(value._source);
					addCustomFields(value._source.properties);
				});
				$scope.Response = response;
			}, function (err) {
				debugOutput(err.message, 'trace');
			});
		}

		/*
			Add custom fields to the item object
		*/
		function addCustomFields(item) {
			if (item.mods) createForgottenMods(item);
			if (item.mods) createImplicitMods(item);
			if (item.mods) createCraftedMods(item);
			if (item.shop) {
				var added = new Date(item.shop.added);
				var updated = new Date(item.shop.updated);
				var modified = new Date(item.shop.modified);
				item.shop['addedHuman'] = added.toLocaleString();
				item.shop['udpatedHuman'] = updated.toLocaleString();
				item.shop['modifiedHuman'] = modified.toLocaleString();
				var now = new Date();
				var hourInMillis = 3600000;
				item.shop['addedHoursAgo'] = (Math.abs(now.getTime() - added.getTime()) / hourInMillis).toFixed(2);
				item.shop['modifiedHoursAgo'] = (Math.abs(now.getTime() - modified.getTime()) / hourInMillis).toFixed(2);
				item.shop['updatedHoursAgo'] = (Math.abs(now.getTime() - updated.getTime()) / hourInMillis).toFixed(2);
			}
		}

		function createForgottenMods(item) {
			var itemTypeKey = firstKey(item.mods);
			var explicits = item.mods[itemTypeKey].explicit;
			var forgottenMods = $.map( explicits, function( propertyValue, modKey ) {
				return {
					display : modToDisplay(propertyValue, modKey),
					key : 'mods.' + itemTypeKey + '.explicit.' + modKey,
					name : modKey,
					value : propertyValue,
					css: getModCssClasses(modKey)
				};
			});
			item['forgottenMods'] = forgottenMods;
			// we call on fm.js to do it's awesome work
			fm_process(item);
		}

		/*
			Get CSS Classes for element resistances
		*/
		function getModCssClasses(mod) {
			var css = "";
			if (mod.indexOf("Resistance") > -1) {
				if (mod.indexOf("Cold") > -1) {
					css = "mod-cold-res"
				}
				else if (mod.indexOf("Fire") > -1) {
					css = "mod-fire-res"
				}
				else if (mod.indexOf("Lightning") > -1) {
					css = "mod-lightning-res"
				}
				else if (mod.indexOf("Chaos") > -1) {
					css = "mod-chaos-res"
				}
			}
			if (mod.indexOf("Damage") > -1) {
				if (mod.indexOf("Cold") > -1) {
					css = "mod-cold-dmg"
				}
				else if (mod.indexOf("Fire") > -1) {
					css = "mod-fire-dmg"
				}
				else if (mod.indexOf("Lightning") > -1) {
					css = "mod-lightning-dmg"
				}
				else if (mod.indexOf("Chaos") > -1) {
					css = "mod-chaos-dmg"
				}
			}
			else if (mod.indexOf("to maximum Life") > -1) {
				css = "mod-life";
			}
			else if (mod.indexOf("to maximum Mana") > -1) {
				css = "mod-mana";
			}
			return css;
		}

		function createImplicitMods(item) {
			var itemTypeKey = firstKey(item.mods);
			var implicits = item.mods[itemTypeKey].implicit;
			var implicitMods = $.map( implicits, function( propertyValue, modKey ) {
				return {
					display : modToDisplay(propertyValue, modKey),
					key : 'mods.' + itemTypeKey + '.implicit.' + modKey
				};
			});
			item['implicitMods'] = implicitMods;
		}
		
		function createCraftedMods(item) {
			var itemTypeKey = firstKey(item.mods);
			var crafteds = item.mods[itemTypeKey].crafted;
			var craftedMods = $.map( crafteds, function( propertyValue, modKey ) {
				return {
					display : modToDisplay(propertyValue, modKey),
					key : 'mods.' + itemTypeKey + '.crafted.' + modKey
				};
			});
			item['craftedMods'] = craftedMods;
		}


		/*
			Save the current/last search terms to HTML storage
		*/
		$scope.saveLastSearch = function(){
			var search = $scope.searchInput;
			var savedSearches = [];

			if (localStorage.getItem("savedSearches") !== null){
				savedSearches = JSON.parse(localStorage.getItem("savedSearches"));
			}

			// return if search is already saved
			if(savedSearches.indexOf(search) != -1){
				return;
			}
			savedSearches.push(search);
			localStorage.setItem("savedSearches", JSON.stringify(savedSearches));
			$scope.savedSearchesList = savedSearches.reverse();
		};

		/*
			Delete selected saved search terms from HTML storage
		*/
		$scope.removeSearchFromList = function(x){
			var savedSearches = JSON.parse(localStorage.getItem("savedSearches"));
			var pos = savedSearches.indexOf(x);

			if(pos != -1){
				savedSearches.splice(pos, 1);
				localStorage.setItem("savedSearches", JSON.stringify(savedSearches));
				$scope.savedSearchesList = savedSearches.reverse();
			}
		};

		/*
		 Save item to HTML storage
		*/
		$scope.saveItem = function(id, name, seller){
			var savedItems = JSON.parse(localStorage.getItem("savedItems"));
			var description = name +' (from: '+seller+')';
			var item = { itemId : id, itemDescription : description };

			if (savedItems === null){
				savedItems = []
			}

			// return if item is already saved
			if(findObjectById(savedItems, id) !== undefined){
				return;
			}

			savedItems.push(item);
			localStorage.setItem("savedItems", JSON.stringify(savedItems));
			$scope.savedItemsList = savedItems.reverse();
		};

		/*
			Check if Array contains a specific Object
		*/
		function containsObject(obj, list) {
			var i;
			for (i = 0; i < list.length; i++) {
				if (list[i] === obj) {
					return true;
				}
			}

			return false;
		}

		/*
		 Delete selected saved search terms from HTML storage
		*/
		$scope.removeItemFromList = function(id){
			var savedItems = JSON.parse(localStorage.getItem("savedItems"));

			savedItems = savedItems.filter(function (el) {
					return el.itemId !== id;
				}
			);

			localStorage.setItem("savedItems", JSON.stringify(savedItems));
			$scope.savedItemsList = savedItems.reverse();
		};


		/*
			Add input Fields (search Prefixes)
		*/
		$scope.addInputField = function() {
			$scope.options.searchPrefixInputs.push({"value":""});
		};

		/*
			Save options to HTML storage
		*/
		$scope.saveOptions = function(){
			localStorage.setItem("savedOptions", JSON.stringify($scope.options));
		};

		$scope.removeInputFromList = function(x){
			var savedOptions = JSON.parse(localStorage.getItem("savedOptions"));
		};

		$scope.scrollToTop = function() {
			angular.element(mainGrid).scrollTo(0,0,500);
		}

		/*
			Find Object by id in Array
		*/
		function findObjectById(list, id) {
			return list.filter(function( obj ) {
				// coerce both obj.id and id to numbers
				// for val & type comparison
				return obj.itemId === id;
			})[ 0 ];
		}

		/*
			Trigger saved Search
		*/
		$scope.doSavedSearch = function(x){
			$scope.searchInput = x;
			$scope.doSearch();
		};

		/*
			Prepare Whisper Message
		*/
        $scope.copyWhisperToClipboard = function(item) {
			var message = item._source.shop.defaultMessage;
			var seller = item._source.shop.lastCharacterName;
			var itemName = item._source.info.fullName;
			var league = item._source.attributes.league;
			var stashTab = item._source.shop.stash.stashName;
			var x = item._source.shop.stash.xLocation;
			var y = item._source.shop.stash.yLocation;

			if (message === undefined) {
				message = '@' + seller + " Hi, I'd like to buy your "
					+ itemName + ' in ' + league
					+ ' (Stash-Tab: "'+ stashTab + '" [x' + x + ',y' + y + '])'
					+ ', my offer is : ';
			}
			return message;
        };

		/*
			Add values to mod description
		*/
		$scope.getItemMods = function(x) {
			var mods = [];

			for (var key in x) {
				var mod = key;

				if( typeof x[key] === 'number' ) {
					mod = mod.replace('#',x[key]);
				}
				else {
					var obj = x[key];
					for (var prop in obj) {
						if(prop == 'avg') continue;
						mod = mod.replace('#',obj[prop]);
					}
				}
				mods.push(mod);
			}
			return mods;
		};

		/*
			Get CSS Classes for item sockets
		*/
		$scope.getSocketClasses = function(x) {
			if(typeof x == "undefined") return [];
			var sockets = [];
			var colors = x.split('-').join('').split('');				
			for (var i = 0; i < colors.length; i++){
				var cssClasses;
				switch (i) {
					case 0 : cssClasses = 'socketLeft'; break;
					case 1 : cssClasses = 'socketRight'; break;
					case 2 : cssClasses = 'socketRight middle'; break;
					case 3 : cssClasses = 'socketLeft middle'; break;
					case 4 : cssClasses = 'socketLeft bottom'; break;
					case 5 : cssClasses = 'socketRight bottom'; break;
				}
				switch (colors[i]) {
					case 'W' : cssClasses += ' socketWhite'; break;
					case 'R' : cssClasses += ' socketRed'; break;
					case 'G' : cssClasses += ' socketGreen'; break;
					case 'B' : cssClasses += ' socketBlue'; break;
				}
				sockets[i] = cssClasses;
			}
			return sockets;
		};

		/*
		 	Get CSS classes for item socket links
		*/
		$scope.getSocketLinkClasses = function(x) {
			if(typeof x == "undefined") return []; 
			var groups = x.split('-');
			var pointer = 0;
			var pos = [];

			for (var i = 0; i < groups.length; i++) {
				var count = groups[i].length - 1;

				try {
					pointer += groups[i - 1].length;
				} catch (err){}

				if(count > 0) {
					for (var j = 0; j < count; j++) {
						var cssClasses;
						switch (pointer+j) {
							case 0 : cssClasses = 'socketLinkCenter'; break;
							case 1 : cssClasses = 'socketLinkRight'; break;
							case 2 : cssClasses = 'socketLinkCenter middle'; break;
							case 3 : cssClasses = 'socketLinkLeft middle'; break;
							case 4 : cssClasses = 'socketLinkCenter bottom'; break;
						}
						pos.push(cssClasses);
					}
				}
			}
			return pos;
		};

		$scope.isEmpty = function (obj) {
			for (var i in obj) if (obj.hasOwnProperty(i)) return false;
			return true;
		};

		$scope.needsILvl = function (item) {
			var type = item.itemType;
			var blacklist = ['Map','Gem','Card','Currency'];

			return blacklist.indexOf(type) == -1;
		};
	}]);


	// Custom filters
	appModule.filter("currencyToCssClass", () => str => {
		var currencyCssClassMap = new Map([
			["Chaos Orb", "chaos-orb"],
			["Exalted Orb", "exalt-orb"]
		]);
		var result = currencyCssClassMap.get(str);
		if(!result) result = str;
		return result;
	});

	appModule.filter("defaultToValue", () => str => {
		var defaultValues = new Map([
			[undefined, "0"]
		]);
		var result = defaultValues.get(str);
		if(!result) result = str;
		return result;
	});

	appModule.filter('isEmpty', [function() {
		return function(object) {
			return angular.equals({}, object);
		}
	}]);

	// Custom Directive
	appModule.directive('myEnter', function () {
		return function (scope, element, attrs) {
			element.bind("keydown keypress", function (event) {
				if(event.which === 13) {
					scope.$apply(function (){
						scope.$eval(attrs.myEnter);
					});

					event.preventDefault();
				}
			});
		};
	});
})();
