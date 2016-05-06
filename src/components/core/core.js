// Copyright 2014 Globo.com Player authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import {isNumber,Fullscreen, requestAnimationFrame, cancelAnimationFrame} from 'base/utils'

import Events from 'base/events'
import Styler from 'base/styler'
import UIObject from 'base/ui_object'
import UICorePlugin from 'base/ui_core_plugin'
import Browser from 'components/browser'
import ContainerFactory from 'components/container_factory'
import Mediator from 'components/mediator'
import PlayerInfo from 'components/player_info'

import find from 'lodash.find'
import $ from 'clappr-zepto'

import coreStyle from './public/style.scss'

/**
 * The Core is responsible to manage Containers, the mediator, MediaControl
 * and the player state.
 * @class Core
 * @constructor
 * @extends UIObject
 * @module components
 */
export default class Core extends UIObject {
  get events() {
    return {
      'webkitfullscreenchange': 'handleFullscreenChange',
      'mousemove': 'showMediaControl',
      'mouseleave': 'hideMediaControl'
    }
  }

  get attributes() {
    return {
      'data-player': '',
      tabindex: 9999,
    }
  }

  /**
   * checks if the core is ready.
   * @property isReady
   * @type {Boolean} `true` if the core is ready, otherwise `false`
   */
  get isReady() {
    return !!this.ready
  }

  get activeContainer() {
    return this._activeContainer
  }

  set activeContainer(container) {
    this._activeContainer = container
    this.trigger(Events.CORE_CONTAINER_ACTIVE, container)
  }

  get mediaControl() { return this.getPlugin('media_control') }

  constructor(options) {
    super(options)
    this.playerInfo = PlayerInfo.getInstance(options.playerId)
    this.options = options
    this.plugins = []
    this.containers = []
    this.listenTo(this, Events.CORE_MEDIACONTROL_FULLSCREEN, this.toggleFullscreen)
    this.listenTo(this, Events.CORE_MEDIACONTROL_SHOW, this.onMediaControlShow.bind(this, true))
    this.listenTo(this, Events.CORE_MEDIACONTROL_HIDE, this.onMediaControlShow.bind(this, false))
    //FIXME fullscreen api sucks
    this._boundFullscreenHandler = () => this.handleFullscreenChange()
    $(document).bind('fullscreenchange', this._boundFullscreenHandler)
    $(document).bind('MSFullscreenChange', this._boundFullscreenHandler)
    $(document).bind('mozfullscreenchange', this._boundFullscreenHandler)
  }

  createContainers(options) {
    this.defer = $.Deferred()
    this.defer.promise(this)
    this.containerFactory = new ContainerFactory(options, options.loader)
    this.containerFactory
      .createContainers()
      .then((containers) => this.setupContainers(containers))
      .then((containers) => this.resolveOnContainersReady(containers))
  }

  updateSize() {
    if (Fullscreen.isFullscreen()) {
      this.setFullscreen()
    } else {
      this.setPlayerSize()
    }
    Mediator.trigger(`${this.options.playerId}:${Events.PLAYER_RESIZE}`, this.playerInfo.currentSize)
  }

  setFullscreen() {
    if(!Browser.isiOS) {
      this.$el.addClass('fullscreen')
      this.$el.removeAttr('style')
      this.playerInfo.previousSize = { width: this.options.width, height: this.options.height }
      this.playerInfo.currentSize = { width: $(window).width(), height: $(window).height() }
    }
  }

  setPlayerSize() {
    this.$el.removeClass('fullscreen')
    this.playerInfo.currentSize = this.playerInfo.previousSize
    this.playerInfo.previousSize = { width: $(window).width(), height: $(window).height() }
    this.resize(this.playerInfo.currentSize)
  }

  resize(options) {
    if (!isNumber(options.height) && !isNumber(options.width))  {
      this.el.style.height = `${options.height}`;
      this.el.style.width = `${options.width}`;
    } else {
      this.el.style.height = `${options.height}px`;
      this.el.style.width = `${options.width}px`;
    }
    this.playerInfo.previousSize = { width: this.options.width, height: this.options.height }
    this.options.width = options.width
    this.options.height = options.height
    this.playerInfo.currentSize = options
    Mediator.trigger(`${this.options.playerId}:${Events.PLAYER_RESIZE}`, this.playerInfo.currentSize)
  }

  enableResizeObserver() {
    var checkSizeCallback = () => {
      if (this.playerInfo.computedSize.width != this.el.clientWidth ||
          this.playerInfo.computedSize.height != this.el.clientHeight) {
        this.playerInfo.computedSize = { width: this.el.clientWidth, height: this.el.clientHeight }
        Mediator.trigger(`${this.options.playerId}:${Events.PLAYER_RESIZE}`, this.playerInfo.computedSize)
      }
    }
    this.resizeObserverInterval = setInterval(checkSizeCallback, 500)
  }

  disableResizeObserver() {
    if (this.resizeObserverInterval) clearInterval(this.resizeObserverInterval)
  }

  resolveOnContainersReady(containers) {
    $.when.apply($, containers).done(() => {
      this.defer.resolve(this)
      this.ready = true
      this.trigger(Events.CORE_READY)
    })
  }

  addPlugin(plugin) {
    this.plugins.push(plugin)
    if (plugin instanceof UICorePlugin) {
      this.$el.append((plugin.render(), plugin.el))
    }
  }

  hasPlugin(name) {
    return !!this.getPlugin(name)
  }

  getPlugin(name) {
    return find(this.plugins, (plugin) => plugin.name === name)
  }

  load(sources, mimeType) {
    this.options.mimeType = mimeType
    sources = sources && sources.constructor === Array ? sources : [sources.toString()];
    this.containers.forEach((container) => container.destroy())
    this.activeContainer = null
    this.containerFactory.options = $.extend(this.options, {sources})
    this.containerFactory.createContainers().then((containers) => {
      this.setupContainers(containers)
    })
  }

  destroy() {
    this.disableResizeObserver()
    this.containers.forEach((container) => container.destroy())
    this.plugins.forEach((plugin) => plugin.destroy())
    this.$el.remove()
    $(document).unbind('fullscreenchange', this._boundFullscreenHandler)
    $(document).unbind('MSFullscreenChange', this._boundFullscreenHandler)
    $(document).unbind('mozfullscreenchange', this._boundFullscreenHandler)
  }

  handleFullscreenChange() {
    this.trigger(Events.CORE_FULLSCREEN, Fullscreen.isFullscreen())
    this.updateSize()
    this.mediaControl.show()
  }

  disableMediaControl() {
    this.mediaControl.disable()
    this.$el.removeClass('nocursor')
  }

  enableMediaControl() {
    this.mediaControl.enable()
  }

  removeContainer(container) {
    this.stopListening(container)
    this.containers = this.containers.filter((c) => c !== container)
  }

  appendContainer(container) {
    this.listenTo(container, Events.CONTAINER_DESTROYED, this.removeContainer)
    this.containers.push(container)
  }

  setupContainers(containers) {
    containers.map(this.appendContainer.bind(this))
    this.trigger(Events.CORE_CONTAINERS_CREATED)
    this.renderContainers()
    this.activeContainer = this.containers[0]
    this.render()
    this.$el.appendTo(this.options.parentElement)
    return this.containers
  }

  renderContainers() {
    this.containers.map((container) => this.el.appendChild(container.render().el))
  }

  createContainer(source, options) {
    var container = this.containerFactory.createContainer(source, options)
    this.appendContainer(container)
    this.el.appendChild(container.render().el)
    return container
  }

  getCurrentContainer() {
    return this.activeContainer
  }

  getCurrentPlayback() {
    var container = this.getCurrentContainer()
    return container && container.playback
  }

  getPlaybackType() {
    var container = this.getCurrentContainer()
    return container && container.getPlaybackType()
  }

  toggleFullscreen() {
    if (!Fullscreen.isFullscreen()) {
      Fullscreen.requestFullscreen(this.el)
      if(!Browser.isiOS) {
        this.$el.addClass('fullscreen')
      }
    } else {
      Fullscreen.cancelFullscreen()
      if(!Browser.isiOS) {
        this.$el.removeClass('fullscreen nocursor')
      }
    }
    this.mediaControl.show()
  }

  showMediaControl(event) {
    this.mediaControl.show(event)
  }

  hideMediaControl(event) {
    this.mediaControl.hide(this.options.hideMediaControlDelay)
  }

  onMediaControlShow(showing) {
    this.getCurrentContainer().trigger(showing?Events.CONTAINER_MEDIACONTROL_SHOW:Events.CONTAINER_MEDIACONTROL_HIDE)

    if (showing)
      this.$el.removeClass('nocursor')
    else if (Fullscreen.isFullscreen())
      this.$el.addClass('nocursor')
  }

  /**
   * enables to configure the container after its creation
   * @method configure
   * @param {Object} options all the options to change in form of a javascript object
   */
  configure(options) {
    this.options = $.extend(this.options, options)
    var sources = options.source || options.sources

    if (sources) {
      this.load(sources, options.mimeType || this.options.mimeType)
    } else {
      this.trigger(Events.CORE_OPTIONS_CHANGE)

      this.containers.forEach((container) => {
        container.configure(this.options)
      })
    }
  }

  render() {
    var style = Styler.getStyleFor(coreStyle, {baseUrl: this.options.baseUrl});
    this.$el.append(style)

    this.options.width = this.options.width || this.$el.width()
    this.options.height = this.options.height || this.$el.height()
    var size = {width: this.options.width, height: this.options.height}
    this.playerInfo.previousSize = this.playerInfo.currentSize = this.playerInfo.computedSize = size
    this.updateSize()

    this.previousSize = { width: this.$el.width(), height: this.$el.height() }

    this.enableResizeObserver()

    return this
  }
}
