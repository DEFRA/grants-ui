import { shouldDisplayAnswer } from './answer-components.js'

describe('shouldDisplayAnswer', () => {
  it.each(['Html', 'Details', 'InsetText', 'Markdown', 'List', 'NotificationBanner', 'HiddenField'])(
    'excludes %s from displayed answers',
    (type) => {
      expect(shouldDisplayAnswer({ type })).toBe(false)
    }
  )

  it.each(['TextField', 'NumberField', 'YesNoField', 'PaymentField', 'FileUploadField', 'DeclarationField'])(
    'keeps the existing display policy for %s',
    (type) => {
      expect(shouldDisplayAnswer({ type })).toBe(true)
    }
  )
})
