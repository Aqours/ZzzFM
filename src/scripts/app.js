/**
 * require jQuery.
 */

jQuery(document).ready(function ($) {

    function ZzzFM() {
        /**
         * localStorage
         * @param this.buffer.id {number}
         * @param this.buffer.tid {number}
         * @param this.buffer.type {string}
         * @param this.buffer.timestamp {number}
         * @param this.buffer.cacheIds {Array}
         */
        this.buffer = {
            type: null, // @stable
            cacheIds: [] // @stable
        };
        this.jqXHRs = {
            remoteIds: null,
            musicInfo: null
        };
        this.options = {};
        this.recursion = {
            checkout: false,
            requestId: null,
            startType: null,
            currentTime: null
        };
        this.config = {
            retry: 3,
            expire: 1200,
            doneCode: 200,
            thumbnail: 360,
            homepage: $(document.body).data('homepage'),
            interface: $(document.body).data('interface'),
            defaultCover: $(document.body).data('defaultCover'),
            storageKey: 'ZzzFM.logger',
            typeMapper: ['song_id', 'album_id', 'artist_id', 'playlist_id']
        };
        this.domNodes = {
            home: document.querySelector('#controller [data-id="fa-home"] .fa-button'),
            over: document.querySelector('#controller [data-id="fa-over"] .fa-button'),
            name: document.querySelector('#detail .name'),
            album: document.querySelector('#surface .album'),
            magic: document.querySelector('#surface .magic'),
            artists: document.querySelector('#detail .artists'),
            elapsed: document.querySelector('#thread .elapsed'),
            surface: document.querySelector('#surface'),
            faMagic: document.querySelector('#surface .magic .fa')
        };
        this.tried = 0;
        this.image = new Image();
        this.audio = document.createElement('audio');
        this.audio.volume = $(document.body).data('defaultVolume');
        this.currentSongSource = null;
        this.decorator();
    }

    $.extend(ZzzFM.prototype, {

        decorator: function () {
            this.setCoverImage();
            this.addImageListener();
            this.restoreBuffer();
            this.checkAudioMisc();
            this.addAudioListener();
            this.addOtherListener();
        },

        /**
         * @recursion
         */
        setCoverImage: function (srcUrl) {
            this.image.src = typeof srcUrl === 'string' ? srcUrl : this.config.defaultCover;
        },

        addImageListener: function () {
            $(this.image).on({
                load: function (e) {
                    var ONE_TURN = Math.PI * 2;
                    var MAX_LENGTH = Math.max(e.data.image.width, e.data.image.height);
                    var HALF_LENGTH = MAX_LENGTH / 2;

                    var canvas = e.data.domNodes.album;
                    var context = canvas.getContext('2d');

                    canvas.width = canvas.height = MAX_LENGTH;
                    context.fillStyle = context.createPattern(e.data.image, 'no-repeat');
                    context.arc(HALF_LENGTH, HALF_LENGTH, HALF_LENGTH, 0, ONE_TURN);
                    context.clearRect(0, 0, MAX_LENGTH, MAX_LENGTH);
                    context.fill();
                },
                error: function (e) {
                    this.src !== e.data.config.defaultCover && e.data.setCoverImage(e.data.config.defaultCover);
                }
            }, this);
        },

        restoreBuffer: function () {
            var buffer = this.readFromStorage();
            if ($.isPlainObject(buffer)) {
                this.buffer.id = buffer.id;
                this.buffer.tid = buffer.tid;
                this.buffer.type = buffer.type;
                this.buffer.cacheIds = buffer.cacheIds;
            }
            !Array.isArray(this.buffer.cacheIds) && (this.buffer.cacheIds = []);
            this.config.typeMapper.indexOf(this.buffer.type) === -1 && this.setBufferType(this.config.typeMapper[0], true);
        },

        checkAudioMisc: function () {
            var total = 0;
            var misc = $(document.body).data('misc');
            var filter = function (prop) {
                if (typeof prop === 'number') {
                    return [prop];
                }
                if (Array.isArray(prop)) {
                    return prop.filter(function (item) {
                        return typeof item === 'number';
                    });
                }
                return [];
            };

            this.config.typeMapper.forEach(function (name) {
                this.options[name] = filter(misc[name]);
                total += this.options[name].length;
            }, this);

            if (total) {
                this.getHyperIDs(this.buffer.id);
            } else { // Prevent Infinite Recursion
                throw new Error('ZzzFM: Unexpected JSON Data');
            }
        },

        /**
         * @recursion
         */
        getHyperIDs: function (id, isRecursion) {
            var that = this;
            var deferred = null;
            var index = this.buffer.cacheIds.indexOf(this.buffer.id);
            var result = typeof id === 'number' ? id : this.buffer.cacheIds[index + 1];

            !isRecursion && (this.recursion.startType = this.buffer.type);

            if (result) {
                this.buffer.id = result;
                this.recursion.checkout = false;
                this.fetchMusicInfo(result);
            } else {
                deferred = this.getNextLogic();
                deferred && deferred.then(function (list) {
                    that.buffer.cacheIds = that.shuffle(list);

                    // Prevent Infinite Recursion
                    if (that.recursion.checkout && that.recursion.startType === that.buffer.type) {
                        console.warn('Infinite Recursion Canceled');
                    } else {
                        that.getHyperIDs(null, true);
                    }
                });
            }
        },

        shuffle: function (items) {
            var len = items.length;
            var randomIndex, buffer;

            while (len) {
                randomIndex = Math.floor(Math.random() * len);
                buffer = items[--len];
                items[len] = items[randomIndex];
                items[randomIndex] = buffer;
            }

            return items;
        },

        fetchMusicInfo: function (result) {
            var that = this;
            this.jqXHRs.musicInfo && this.jqXHRs.musicInfo.state() === 'pending' && this.jqXHRs.musicInfo.abort();
            this.jqXHRs.musicInfo = $.ajax({
                url: this.config.interface,
                data: {
                    s: 'blend',
                    id: result
                },
                cache: true,
                context: this,
                dataType: 'json'
            });
            this.jqXHRs.musicInfo.then(function (json) {
                if (json['code'] === that.config.doneCode) {
                    that.renderAudio(json['list'][0]);
                }
            });
        },

        renderAudio: function (song) {
            if ($.isPlainObject(song)) {
                if (song['url']) {
                    this.tried = 0;
                    this.image.src = this.getImagePackage(song['picUrl']);
                    this.domNodes.name.textContent = song['name'];
                    this.domNodes.artists.textContent = song['artists'];
                    this.audio.src = song['url'];
                    this.currentSongSource = song;
                    this.playAudio();
                } else {
                    this.tried++ < this.config.retry ? this.nextTrack() : this.tried = 0;
                    console.info('Continuity Count Error:', this.tried);
                }
            } else {
                console.warn('Invalid Song Data');
                this.tried++ < this.config.retry ? this.nextTrack() : this.tried = 0;
                console.info('Continuity Count Error:', this.tried);
            }
        },

        getImagePackage: function (picUrl) {
            return picUrl + '?param=' + this.config.thumbnail + 'y' + this.config.thumbnail;
        },

        /**
         * @recursion
         */
        getNextLogic: function () {
            var that = this;
            var deferred = null;
            var typeIndex = this.config.typeMapper.indexOf(this.buffer.type);
            var tidIndex = this.options[this.buffer.type].indexOf(this.buffer.tid);
            var tidMaxIndex = this.options[this.buffer.type].length - 1;

            if (tidIndex + 1 > tidMaxIndex) {
                this.setBufferType(this.config.typeMapper[typeIndex + 1 > this.config.typeMapper.length - 1 ? 0 : typeIndex + 1]);

                // Prevent Infinite Recursion
                return this.getNextLogic();
            }

            if (this.jqXHRs.remoteIds && this.jqXHRs.remoteIds.state() === 'pending') {
                return null;
            } else {
                if (this.buffer.type === this.config.typeMapper[0]) {
                    this.buffer.tid = this.options[this.buffer.type][tidMaxIndex];
                    deferred = $.Deferred();
                    deferred.resolve(this.options[this.buffer.type]);
                    return deferred;
                } else {
                    this.buffer.tid = this.options[this.buffer.type][tidIndex + 1];
                    this.jqXHRs.remoteIds = $.ajax({
                        url: this.config.interface,
                        data: {
                            s: this.buffer.type.split('_')[0],
                            id: this.buffer.tid
                        },
                        cache: true,
                        dataType: 'json'
                    });
                    return this.jqXHRs.remoteIds.then(function (json) {
                        if (json['code'] === that.config.doneCode) {
                            return json['list'].map(function (item) {
                                return item['id'];
                            });
                        } else {
                            return [];
                        }
                    });
                }
            }
        },

        /**
         * Use this to set `this.buffer.type`
         * DO NOT set `this.buffer.type` directly
         */
        setBufferType: function (type, isInit) {
            this.buffer.id = null;
            this.buffer.tid = null;
            this.buffer.type = type;
            this.recursion.checkout = !isInit;
        },

        readFromStorage: function () {
            try {
                return JSON.parse(localStorage.getItem(this.config.storageKey));
            } catch (e) {
                console.warn(e.message);
                return null;
            }
        },

        writeToStorage: function () {
            var data = $.extend(this.buffer, {timestamp: Date.now()});
            try {
                localStorage.setItem(this.config.storageKey, JSON.stringify(data));
            } catch (e) {
                console.warn(e.message);
            }
        },

        /**
         * @recursion
         */
        playAudio: function () {
            var time = Math.ceil(Date.now() / 1000);
            var song = this.currentSongSource;
            var rest = this.audio.duration - this.audio.currentTime; // Maybe `NaN`
            var minExpire = this.audio.duration || 300;
            var expire = song['expi'] < minExpire ? this.config.expire : song['expi'];
            var isExpire = Math.ceil(rest) < expire && time - song['timestamp'] + Math.ceil(rest || 0) > expire;

            if (isExpire) {
                this.recursion.currentTime = this.audio.currentTime;
                this.nextTrack(song['id'])
            } else {
                if (this.recursion.currentTime) {
                    this.audio.currentTime = this.recursion.currentTime;
                    this.recursion.currentTime = null;
                }
                this.audio.play();
            }
        },

        pauseAudio: function () {
            this.audio.pause();
        },

        nextTrack: function (id) {
            this.pauseAudio();
            this.getHyperIDs(id);
        },

        requestAlbumRotate: function () {
            var ANIMATION_FPS = 60;
            var ONE_TURN_TIME = 30;
            var MAX_STEP_FRAME = 3;
            var ONE_TURN = Math.PI * 2;
            var MAX_EACH_FRAME_TIME = 1000 / 50;
            var EACH_FRAME_RADIAN = 1 / (ANIMATION_FPS * ONE_TURN_TIME) * ONE_TURN;

            var context = this.domNodes.album.getContext('2d');
            var prevTimestamp = 0;
            var loopAnimation = (function (timestamp) {
                var step, interval;
                var MAX_LENGTH = Math.max(this.domNodes.album.width, this.domNodes.album.height);
                var HALF_LENGTH = MAX_LENGTH / 2;

                if (prevTimestamp && timestamp - prevTimestamp > MAX_EACH_FRAME_TIME) {
                    interval = timestamp - prevTimestamp;
                    step = Math.min(Math.round(interval / MAX_EACH_FRAME_TIME), MAX_STEP_FRAME);
                    console.warn(interval);
                } else {
                    step = 1;
                }
                prevTimestamp = timestamp;

                context.translate(HALF_LENGTH, HALF_LENGTH);
                context.rotate(EACH_FRAME_RADIAN * step);
                context.translate(-HALF_LENGTH, -HALF_LENGTH);
                context.clearRect(0, 0, MAX_LENGTH, MAX_LENGTH);
                context.fill();

                if (this.audio.paused) {
                    this.cancelAlbumRotate();
                } else {
                    this.recursion.requestId = window.requestAnimationFrame(loopAnimation);
                }
            }).bind(this);

            this.cancelAlbumRotate();
            this.recursion.requestId = window.requestAnimationFrame(loopAnimation);
        },

        cancelAlbumRotate: function () {
            this.recursion.requestId && window.cancelAnimationFrame(this.recursion.requestId);
        },

        addAudioListener: function () {
            $(this.audio).on({
                playing: function (e) {
                    e.data.requestAlbumRotate();
                },
                waiting: function (e) {
                    e.data.cancelAlbumRotate();
                },
                play: function (e) {
                    $(e.data.domNodes.faMagic).removeClass('fa-play').addClass('fa-pause');
                },
                pause: function (e) {
                    $(e.data.domNodes.faMagic).removeClass('fa-pause').addClass('fa-play');
                },
                ended: function (e) {
                    e.data.audio.pause();
                    e.data.nextTrack();
                },
                timeupdate: function (e) {
                    $(e.data.domNodes.elapsed).css('width', (e.data.audio.currentTime / e.data.audio.duration).toFixed(5) * 100 + '%');
                },
                error: function (e) {
                    if (e.target && e.target.error) {
                        console.warn(e.target.error);
                    }
                    if (e.message) {
                        console.warn(e.message);
                    }
                }
            }, this);
        },

        addOtherListener: function () {
            $(window).on('unload', this, function (e) {
                e.data.writeToStorage();
            });

            $(document).on('keydown', this, function (e) {
                if (e.ctrlKey && e.which === 39) { // Ctrl+Right
                    e.preventDefault();
                    e.data.nextTrack();
                }
            });

            $(this.domNodes.home).on('click', this, function (e) {
                window.open(e.data.config.homepage);
            });

            $(this.domNodes.over).on('click', this, function (e) {
                e.data.nextTrack();
            });

            $(this.domNodes.magic).on('click', this, function (e) {
                e.data.audio.paused ? e.data.playAudio() : e.data.pauseAudio();
            });
        }

    });

    new ZzzFM();

});
