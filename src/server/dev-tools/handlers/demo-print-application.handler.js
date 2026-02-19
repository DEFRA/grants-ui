import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { buildDemoData, buildDemoPrintAnswers } from '../helpers/index.js'
import {
  findFormBySlug,
  buildPrintViewModel,
  enrichDefinitionWithListItems
} from '../../common/helpers/print-application-service/print-application-service.js'
import { generateFormNotFoundResponse } from '../utils/index.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'

/**
 * Main demo print application handler
 * @param {object} request - Hapi request object
 * @param {object} h - Hapi response toolkit
 * @returns {Promise<object>} Hapi response
 */
export async function demoPrintApplicationHandler(request, h) {
  try {
    const { slug } = request.params

    const form = findFormBySlug(slug)

    if (!form) {
      return generateFormNotFoundResponse(slug, h)
    }

    const raw = await readFile(form.path, 'utf8')
    const definition = parseYaml(raw)

    enrichDefinitionWithListItems(definition)

    const answers = buildDemoPrintAnswers(definition)
    const demoData = buildDemoData()

    const viewModel = buildPrintViewModel({
      definition,
      form,
      answers,
      referenceNumber: demoData.referenceNumber,
      submittedAt: new Date().toISOString(),
      slug,
      sessionData: {
        businessName: demoData.businessName,
        sbi: demoData.sbi,
        contactName: demoData.contactName
      }
    })

    return h.view('print-submitted-application', viewModel)
  } catch (error) {
    log(LogCodes.PRINT_APPLICATION.ERROR, {
      userId: 'demo',
      errorMessage: `Demo print application route error: ${error.message}`,
      slug: request.params?.slug
    })

    return h
      .response(
        `<html>
      <head><title>Demo Print Application Error</title></head>
      <body style="font-family: system-ui, sans-serif; margin: 40px;">
        <div style="background: #ffe6cc; padding: 15px; border-left: 4px solid #f47738; margin-bottom: 30px;">
          <strong>Development Mode Error</strong><br>
          ${error.message}
        </div>
        <p><a href="/dev">Back to Dev Tools</a></p>
      </body>
    </html>`
      )
      .type('text/html')
  }
}
