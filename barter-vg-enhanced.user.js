// ==UserScript==
// @name         Barter.vg enhancer
// @namespace    https://alexanderschroeder.net/
// @version      0.4
// @description  Summarizes and compares all attributes in an offer for easy comparison of offer value
// @homepage     https://github.com/alexschrod/barter-vg-enhancer
// @author       Alexander Krivács Schrøder
// @downloadURL  https://alexanderschroeder.net/userscripts/barter-vg-enhancer.user.js
// @supportURL   https://github.com/alexschrod/barter-vg-enhancer/issues
// @match        https://barter.vg/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.1.0/jquery.min.js
// @connect      store.steampowered.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @noframes
// ==/UserScript==

/*jshint multistr: true */

(function() {
    'use strict';

    


    function offersPage() {
        $('.tradables_info strong:first-child, .tradables_info div:nth-child(3)').css("width", "230px");

        var steamAppIdRegEx = /\/app\/(\d+)\//;
        var reviewScoreRegEx = /(\d+)% positive of (\d+) user reviews/;
        var tradeableRegEx = /(\d+) Barter.vg users have this tradable/;
        var wishlistRegEx = /(\d+) Barter.vg users wishlisted this game/;
        var bundleRegEx = /(\d+) bundles?: (.*)/;
        var storePageRegEx = /http:\/\/store\.steampowered\.com\/app\/(\d+)\//;

        var tradeables = $('.tradables');
        var first = true;
        var allGames = [];
        var offeredGames = [];
        var requestedGames = [];
        $.each(tradeables, function(_, tradeable) {
            var whose = $(tradeable).find('legend strong').html();

            var gameList = $(tradeable).find('.tradables_items_list li:not(.bold)');
            var games = $.map(gameList, function(gameListEntry) {
                var gameName = $(gameListEntry).find('> strong > a,a:first-of-type').html();
                var reviewBox = $(gameListEntry).find('a[href*="#app_reviews_hash"]');

                var steamAppId = null;
                var reviewPercentage = null;
                var reviewerCount = null;
                var gameInfoLine;
                var hasReviewCount = false;
                if (reviewBox.length === 0) {
                    var storePage = $(gameListEntry).find('a[title="Steam store page"]');
                    if (storePage.length > 0) {
                        var storePageMatch = storePage[0].href.match(storePageRegEx);
                        if (storePage.length > 1) {
                            steamAppId = storePageMatch[1];
                        }
                    }
                    gameInfoLine = storePage.parent();
                } else {
                    steamAppId = reviewBox[0].pathname.match(steamAppIdRegEx)[1];
                    var reviewScoreData = reviewBox.find('> abbr')[0].title.match(reviewScoreRegEx);
                    reviewPercentage = reviewScoreData[1];
                    reviewerCount = reviewScoreData[2];
                    gameInfoLine = reviewBox.parent();
                    hasReviewCount = true;
                }

                var gameInfoChildren = gameInfoLine.children();
                if (gameInfoChildren.length === 0) {
                    return null;
                }

                var tradeableCount = gameInfoChildren[0].title.match(tradeableRegEx)[1];
                var wishlistCount = gameInfoChildren[1].title.match(wishlistRegEx)[1];
                var isBundled = gameInfoChildren[2].tagName !== 'ABBR';
                var bundleCount = 0;
                var bundles = [];
                if (isBundled) {
                    var bundleData = $(gameInfoChildren[2]).children()[0].title.match(bundleRegEx);
                    bundleCount = bundleData[1];
                    bundles = bundleData[2].split('; ');
                }
                var game = {
                    element: gameListEntry,
                    steamAppId: steamAppId,
                    reviewScore: {
                        percentage: Number(reviewPercentage),
                        votes: Number(reviewerCount)
                    },
                    tradeable: Number(tradeableCount),
                    wishlist: Number(wishlistCount),
                    bundles: {
                        count: Number(bundleCount),
                        entries: bundles
                    }
                };
                if (first) {
                    offeredGames.push(game);
                } else {
                    requestedGames.push(game);
                }
                return game;
            });
            $.each(games, function(_, game) {
                allGames.push(game);
            });

            var gameStats = games.reduce(function(previousValue, currentValue, currentIndex, array) {
                previousValue.totalTradeable += currentValue.tradeable;
                previousValue.totalWishlist += currentValue.wishlist;
                previousValue.averageReviewScore += currentValue.reviewScore.percentage;
                previousValue.averageWeightedReviewScore += currentValue.reviewScore.percentage * currentValue.reviewScore.votes;
                previousValue.voteCount += currentValue.reviewScore.votes;
                previousValue.gamesInBundles += (currentValue.bundles.count > 0) ? 1 : 0;
                previousValue.totalBundles += currentValue.bundles.count;
                previousValue.games += 1;
                return previousValue;
            }, {
                totalTradeable: 0,
                totalWishlist: 0,
                averageReviewScore: 0,
                averageWeightedReviewScore: 0,
                voteCount: 0,
                gamesInBundles: 0,
                games: 0,
                totalBundles: 0
            });

            gameStats.averageReviewScore = Number((gameStats.averageReviewScore / gameStats.games).toFixed(0));
            gameStats.averageWeightedReviewScore = Number((gameStats.averageWeightedReviewScore / gameStats.voteCount).toFixed(0));
            var tradeRatio = gameStats.totalTradeable / gameStats.totalWishlist;
            var fractions;
            if (tradeRatio < 1) {
                fractions = getFractions(tradeRatio);
                gameStats.tradeRatioRounded = fractions.rounded.n + " : " + fractions.rounded.d;
                gameStats.tradeRatioActual = fractions.real.n + " : " + fractions.real.d;
                gameStats.tradeRatioSmallest = fractions.smallest.n + " : " + fractions.smallest.d;
            } else if (tradeRatio > 1) {
                fractions = getFractions(1 / tradeRatio);
                gameStats.tradeRatioRounded = fractions.rounded.d + " : " + fractions.rounded.n;
                gameStats.tradeRatioActual = fractions.real.d + " : " + fractions.real.n;
                gameStats.tradeRatioSmallest = fractions.smallest.d + " : " + fractions.smallest.n;
            } else {
                gameStats.tradeRatioRounded = gameStats.tradeRatioActual = gameStats.tradeRatioSmallest = "1 : 1";
            }

            var tradeSummary =
                '<p>Trade summary:</p>\
<table style="width: 100%;">\
<tr>\
<th>Games in bundles</th><td>{1}</td>\
</tr>\
<tr>\
<th>Total bundles</th><td>{8}</td>\
</tr>\
<tr>\
<th>Average review score <span title="The more reviews it has, the proportionally larger that game\'s impact on the score" style="border-bottom: dotted 1px; cursor: help; font-size: 16px;">(weighted)</span></th><td>{4}% ({5}%)</td>\
</tr>\
<tr>\
<th>Number of reviews <span title="The binary logarithm of the number of reviews. A difference of +1 means &quot;twice as popular&quot;, and -1 means &quot;half as popular&quot;." style="border-bottom: dotted 1px; cursor: help; font-size: 16px;">(log<sub>2</sub>)</span></th><td>{10} ({11})</td>\
</tr>\
<tr>\
<th>Trade ratio (H : W)</th><td>rounded: {6},<br>small: {7},<br>actual: {9}</td>\
</tr>\
<tr>\
<th>Total price on Steam (ignoring any active discounts)</th><td id="{12}_total_value">Loading...</td>\
</tr>\
<tr>\
<th>Average price per game on Steam (ignoring any active discounts)</th><td id="{12}_average_value">Loading...</td>\
</tr>\
</table>'.format(
    gameStats.games,
    gameStats.gamesInBundles,
    gameStats.totalTradeable,
    gameStats.totalWishlist,
    gameStats.averageReviewScore,
    gameStats.averageWeightedReviewScore,
    gameStats.tradeRatioRounded,
    gameStats.tradeRatioSmallest,
    gameStats.totalBundles,
    gameStats.tradeRatioActual,
    gameStats.voteCount,
    (Math.log(gameStats.voteCount) / Math.log(2)).toFixed(2),
    first ? "offered" : "requested");

            if (first) {
                $(tradeable).after(tradeSummary);
                first = false;
            } else {
                $(tradeable).before(tradeSummary);
            }
        });

        var steamIds = [];
        $.each(allGames, function(_, game) {
            if ($.inArray(game.steamAppId, steamIds) !== -1) {
                return;
            }
            steamIds.push(game.steamAppId);
        });
        getSteamPricesFor(steamIds, function(success, gamePrices) {
            if (!success) {
                console.error("Error fetching game prices from Steam");
                return;
            }
            $.each(allGames, function(_, game) {
                if (game.steamAppId === null) return;

                var tradeRatio = game.tradeable / game.wishlist;
                var fractions;
                var tradeRatioRounded, tradeRatioActual, tradeRatioSmallest;
                if (tradeRatio < 1) {
                    fractions = getFractions(tradeRatio);
                    tradeRatioRounded = fractions.rounded.n + " : " + fractions.rounded.d;
                    tradeRatioActual = fractions.real.n + " : " + fractions.real.d;
                    tradeRatioSmallest = fractions.smallest.n + " : " + fractions.smallest.d;
                } else if (tradeRatio > 1) {
                    fractions = getFractions(1 / tradeRatio);
                    tradeRatioRounded = fractions.rounded.d + " : " + fractions.rounded.n;
                    tradeRatioActual = fractions.real.d + " : " + fractions.real.n;
                    tradeRatioSmallest = fractions.smallest.d + " : " + fractions.smallest.n;
                } else {
                    tradeRatioRounded = gameStats.tradeRatioActual = gameStats.tradeRatioSmallest = "1 : 1";
                }
                var gameElement = game.element;

                if (game.steamAppId in gamePrices) {
                    var gamePrice = gamePrices[game.steamAppId].prices;
                    if (typeof gamePrice === 'undefined') {
                        gamePrice = {
                            final: 0,
                            initial: 0,
                            discount_percent: 0
                        };
                    }
                    game.price = gamePrice;
                    $(gameElement).css("position", "relative");
                    if (gamePrice.final === 0) {
                        $(gameElement).append('<div style="position: absolute; top: 0; right: 15px;">Steam Store Price: Free<br>Ratio: {0}</div>'.format(tradeRatioSmallest));
                    } else {
                        $(gameElement).append('<div style="position: absolute; top: 0; right: 15px;">Steam Store Price: {0} {1}<br>Ratio: {2}</div>'
                                              .format(gamePrice.currency, gamePrice.discount_percent === 0 ?
                                                      gamePrice.final / 100.0 :
                                                      "{0} ({1}% off)".format(gamePrice.final / 100.0, gamePrice.discount_percent), tradeRatioSmallest));
                    }
                } else {
                    console.warn("Missing price for:", game.steamAppId);
                    $(gameElement).append('<div style="position: absolute; top: 0; right: 15px;"><br>Ratio: {0}</div>'.format(tradeRatioSmallest));
                }
            });

            var currency = null;
            var offeredTotal = offeredGames.reduce(function(previousValue, currentValue, currentIndex, array) {
                if (currency === null && typeof currentValue.price !== 'undefined' && typeof currentValue.price.currency !== 'undefined') {
                    currency = currentValue.price.currency;
                }
                if (typeof currentValue.price === 'undefined') return previousValue;
                return previousValue + currentValue.price.initial;
            }, 0);
            var offeredDiscountedTotal = offeredGames.reduce(function(previousValue, currentValue, currentIndex, array) {
                if (typeof currentValue.price === 'undefined') return previousValue;
                return previousValue + currentValue.price.final;
            }, 0);

            var requestedTotal = requestedGames.reduce(function(previousValue, currentValue, currentIndex, array) {
                if (currency === null && typeof currentValue.price.currency !== 'undefined') {
                    currency = currentValue.price.currency;
                }
                if (typeof currentValue.price === 'undefined') return previousValue;
                return previousValue + currentValue.price.initial;
            }, 0);
            var requestedDiscountedTotal = requestedGames.reduce(function(previousValue, currentValue, currentIndex, array) {
                if (typeof currentValue.price === 'undefined') return previousValue;
                return previousValue + currentValue.price.final;
            }, 0);

            $("#offered_total_value").html('{0} {1} ({2})'.format(currency, offeredDiscountedTotal / 100.0, offeredTotal / 100.0));
            $("#requested_total_value").html('{0} {1} ({2})'.format(currency, requestedDiscountedTotal / 100.0, requestedTotal / 100.0));

            $("#offered_average_value").html('{0} {1} ({2})'.format(currency, (offeredDiscountedTotal / offeredGames.length / 100.0).toFixed(2), (offeredTotal / offeredGames.length / 100.0).toFixed(2)));
            $("#requested_average_value").html('{0} {1} ({2})'.format(currency, (requestedDiscountedTotal / requestedGames.length / 100.0).toFixed(2), (requestedTotal / requestedGames.length / 100.0).toFixed(2)));
        });
    }

    function creatingPage() {
        var tradeables = $('.tradables');

        $.each(tradeables, function(_, tradeable) {
            var whose = $(tradeable).find('legend strong').html();

            var gameList = $(tradeable).find('.collection tr:has(input[type="checkbox"])');
            var games = $.map(gameList, function(gameListEntry) {
                if ($(gameListEntry).find('> td').length !== 4)
                    return null;
                
                // Add column for price
                $(gameListEntry).append('<td>Loading price...</td>');
                
                // Add column for ratio
                $(gameListEntry).append('<td>Loading ratio...</td>');
                console.log(gameListEntry);
            });
        });
    }

    // /u/*/o/*/
    var offersPageRegex = /https:\/\/barter\.vg\/u\/.+\/o\/.+\//;
    var offersListPageRegex = /https:\/\/barter\.vg\/u\/.+\/o\//;
    if (offersPageRegex.test(window.location.href) && $('.statusCurrent').text() !== "Creating...") {
        offersPage();
    } else if ((offersPageRegex.test(window.location.href) || offersListPageRegex.test(window.location.href)) && $('.statusCurrent').text() === "Creating...") {
        creatingPage();
    } else {
        console.log(window.location.href);
    }
})();
