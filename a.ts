import { Component } from 'lib/component'
import { DialogButtonConfig, DialogContentConfig, DialogConfig } from '.'
import { DomElementConfig, DomElement } from 'lib/dom-element'
import { ButtonGroup, ButtonGroupConfig } from 'client/components/button-group'
import './dialog.scss'

type DialogElementType = '<div>'
type DialogElementConfig = DomElementConfig<DialogElementType>

const DefaultMaximumQueueSize = 20
const DefaultQueueOverflowMessage = 'Too many messages. Some messages have been dropped.'
const DefaultMessage = 'Unknown message.'

interface DialogState<BID extends string> {
  readonly queueSize: number
  readonly queueOverflowMessageShown?: boolean
  readonly dialogPromise?: Promise<DialogButtonConfig<BID> | undefined>
  readonly dialogPromiseResolver?: (value: DialogButtonConfig<BID> | PromiseLike<DialogButtonConfig<BID> | undefined> | undefined) => void
  readonly cancelRequested?: boolean
}

export class Dialog<BID extends string> extends Component {
  private _state: DialogState<BID> = { queueSize: 0 }
  private _backdropJQueryObject: JQuery | undefined
  constructor(readonly dialogConfig: DialogConfig) {
    super(dialogConfig)
  }
  get backdropJQueryObject(): JQuery | undefined {
    return this._backdropJQueryObject
  }
  set backdropJQueryObject(backdropJQueryObject: JQuery | undefined) {
    if(!backdropJQueryObject) {
      this.removeBackdropJQueryObject()
      return
    }
    if(this._backdropJQueryObject !== void 0) {
      this.removeBackdropJQueryObject()
    }
    this._backdropJQueryObject = backdropJQueryObject
  }
  private removeBackdropJQueryObject(): void {
    if(this._backdropJQueryObject) {
      this._backdropJQueryObject.remove()
      delete this._backdropJQueryObject
    }
  }
  get state(): DialogState<BID> {
    return this._state
  }
  set state(state: DialogState<BID>) {
    // reset "cancelRequested" if the queue is empty
    const cancelRequested: boolean = state.cancelRequested && (state.queueSize > 0)
    this._state = { ...state, cancelRequested }
  }
  private resolveDialogPromise<B extends DialogButtonConfig<BID>>(clickedButton?: B): void {
    if(this.state.dialogPromiseResolver) {
      this.state.dialogPromiseResolver(clickedButton)
      const { dialogPromiseResolver, ...stateWithoutDialogPromiseResolver } = this.state
      this.state = stateWithoutDialogPromiseResolver
    }
  }
  get maximumQueueSize(): number {
    const maximumQueueSize: number | undefined = this.dialogConfig.maximumQueueSize
    return (maximumQueueSize !== void 0)? maximumQueueSize : DefaultMaximumQueueSize
  }
  get queueOverflowMessage(): string {
    return this.dialogConfig.queueOverflowMessage || DefaultQueueOverflowMessage
  }
  show(anchor: HTMLElement | string, content: DialogContentConfig<BID> = { message: DefaultMessage }): void {
    const jQuery: JQueryStatic = this.jQuery
    const buttons = content.buttons || []
    const buttonGroup = new ButtonGroup({
      buttons: buttons.map(button => ({
        buttonIdentifier: button.identifier,
        text: button.text,
        onClicked: () => {
          console.log(button.identifier, 'clicked')
          this.hide(button)
        },
        onKeyPressed: () => {
          console.log(button.identifier, 'key pressed')
          this.hide(button)
        }
      })),
      cssClasses: ['pull-right', 'padded-top']
    })
    const dialogConfig: DialogElementConfig = {
      jQuery,
      domElementType: '<div>',
      cssClasses: ['dialog', 'dialog-display'].concat((content.messageType !== 'default')? `${content.messageType}-dialog-display` : []),
      attributes: { tabindex: '0' },
      children: [
        <DialogElementConfig>{
          jQuery,
          domElementType: '<div>',
          cssClasses: ['dialog-window'],
          children: [
            <DialogElementConfig>{
              jQuery,
              domElementType: '<div>',
              text: content.message
            }
          ],
          onCreated: buttons.length? (domElement: DomElement, jQueryObject: JQuery) => {
            const element: HTMLElement = jQueryObject[0]
            buttonGroup.show(element)
          } : void 0
        }
      ]
    }
    const backdropConfig: DialogElementConfig = {
      jQuery,
      domElementType: '<div>',
      cssClasses: ['dialog', 'dialog-backdrop'].concat((content.messageType !== 'default')? `${content.messageType}-dialog-backdrop` : [])
    }
    const backdropAnchor: HTMLElement | string = this.dialogConfig.backdropAnchor
    this.jQueryObject = new DomElement(dialogConfig).create(anchor)
    this.backdropJQueryObject = new DomElement(backdropConfig).create(backdropAnchor)
    const jQueryObject: JQuery = this.jQueryObject
    jQueryObject.focus() // to make "keypress" work
    if(buttons.length) {
      const defaultFocusedButton: BID = content.defaultFocusedButton
      if(defaultFocusedButton) {
        buttonGroup.focusButton(defaultFocusedButton)
      }
    } else {
      jQueryObject.keypress(() => this.hide())
      jQueryObject.click(() => this.hide())
    }
  }
  async ask<B extends DialogButtonConfig<BID>>(content: DialogContentConfig<BID>): Promise<B | undefined> {
    console.log('ASK', this.state)
    const queueSize: number = this.state.queueSize // keep queue size before await
    if(queueSize >= this.maximumQueueSize) {
      if(this.state.queueOverflowMessageShown) {
        // queue overflow message is already shown => do nothing (return undefined)
        return
      } else {
        this.state = { ...this.state, queueOverflowMessageShown: true } // queue overflow message is going to be shown
      }
    } else {
      this.state = { ...this.state, queueOverflowMessageShown: false }
    }
    const dialogPromise = new Promise<B>(async resolve => {
      this.state = { ...this.state, queueSize: this.state.queueSize + 1 }
      // wait for previously active dialog
      const previousDialogPromise: Promise<DialogButtonConfig<BID>> = this.state.dialogPromise
      if(previousDialogPromise) {
        await previousDialogPromise
        if(this.state.cancelRequested) {
          resolve()
          this.state = { ...this.state, queueSize: this.state.queueSize - 1 }
          // if(this.state.queueSize < 1) {
          //   this.state = { ...this.state, cancelRequested: false }
          //   console.log('QUEUE SIZE IS 0', this.state)
          // }
          return // CAUTION important
        }
      }
      // show dialog
      const anchor = this.dialogConfig.anchor
      if(queueSize >= this.maximumQueueSize) {
        this.state = { ...this.state, dialogPromiseResolver: value => {
          resolve()
          this.state = { ...this.state, queueSize: this.state.queueSize - 1 }
        }}
        this.show(anchor, { message: this.queueOverflowMessage, buttons: [] })
      } else {
        this.state = { ...this.state, dialogPromiseResolver: value => {
          resolve(value as B)
          this.state = { ...this.state, queueSize: this.state.queueSize - 1 }
        }}
        this.show(anchor, content)
      }
    })
    this.state = { ...this.state, dialogPromise }
    return dialogPromise
  }
  hide(clickedButton?: DialogButtonConfig<BID>): void {
    super.hide()
    this.removeBackdropJQueryObject()
    this.resolveDialogPromise(clickedButton)
  }
  cancelAll(): void {
    if(this.state.queueSize > 0) {
      this.state = { ...this.state, cancelRequested: true }
      this.hide()
    }
  }
}
