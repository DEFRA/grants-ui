import { createTaskListPageModel } from '../../../helpers/create-tasklist-page-model.js'

export const model = createTaskListPageModel([
  {
    title: '1. Check before you start',
    subsections: [
      {
        text: 'Business status',
        href: 'adding-value-with-tasklist/nature-of-business',
        status: 'notYetStarted'
      },
      {
        text: 'Project prepartion',
        href: 'adding-value-with-tasklist/planning-permission',
        status: 'notYetStarted'
      }
    ]
  },
  {
    title: '2. Facilities',
    subsections: [
      {
        text: 'Abattoir',
        href: 'adding-value-with-tasklist/smaller-abattoir',
        status: 'notYetStarted'
      },
      {
        text: 'Controlled atmosphere fruit storage',
        href: 'adding-value-with-tasklist/fruit-storage',
        status: 'cannotStartYet'
      },
      {
        text: 'Storage Facilities',
        href: 'adding-value-with-tasklist/storage',
        status: 'cannotStartYet'
      }
    ]
  },
  {
    title: '3. Costs',
    subsections: [
      {
        text: 'Costs',
        href: 'adding-value-with-tasklist/project-cost',
        status: 'notYetStarted'
      }
    ]
  },
  {
    title: '4. Impact',
    subsections: [
      {
        text: 'Produce',
        href: 'adding-value-with-tasklist/produce-processed',
        status: 'cannotStartYet'
      },
      {
        text: 'Project',
        href: 'adding-value-with-tasklist/project-impact',
        status: 'cannotStartYet'
      },
      {
        text: 'Mechanisation',
        href: 'adding-value-with-tasklist/manual-labour-amount',
        status: 'notYetStarted'
      },
      {
        text: 'Future customers',
        href: 'adding-value-with-tasklist/future-customers',
        status: 'notYetStarted'
      },
      {
        text: 'Collaboration',
        href: 'adding-value-with-tasklist/collaboration',
        status: 'notYetStarted'
      },
      {
        text: 'Environment',
        href: 'adding-value-with-tasklist/environmental-impact',
        status: 'notYetStarted'
      }
    ]
  },
  {
    title: '5. Finalisation',
    subsections: [
      {
        text: 'Score results',
        href: 'adding-value-with-tasklist/score-results',
        status: 'cannotStartYet'
      },
      {
        text: 'Business Details',
        href: 'adding-value-with-tasklist/business-details',
        status: 'notYetStarted'
      },
      {
        text: 'Who is applying?',
        href: 'adding-value-with-tasklist/who-is-applying',
        status: 'notYetStarted'
      },
      {
        text: 'Agent',
        href: 'adding-value-with-tasklist/agent-details',
        status: 'cannotStartYet'
      },
      {
        text: 'Applicant',
        href: 'adding-value-with-tasklist/applicant-details',
        status: 'cannotStartYet'
      },
      {
        text: 'Check your details',
        href: 'adding-value-with-tasklist/check-details',
        status: 'cannotStartYet'
      },
      {
        text: 'Confirm and send',
        href: 'adding-value-with-tasklist/declaration',
        status: 'cannotStartYet'
      },
      {
        text: 'Confirmation',
        href: 'adding-value-with-tasklist/confirmation',
        status: 'cannotStartYet'
      }
    ]
  }
])
