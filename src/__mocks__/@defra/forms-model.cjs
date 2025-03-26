// Mock the @defra/forms-model exports
const enums = {
  // Add any enums that are used in your application
  SectionType: {
    QUESTION: 'QUESTION',
    SEQUENTIAL: 'SEQUENTIAL'
  },
  AnswerType: {
    SINGLE_ANSWER: 'SINGLE_ANSWER',
    MULTIPLE_ANSWERS: 'MULTIPLE_ANSWERS'
  },
  Status: {
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED'
  }
}

// Export all needed parts
module.exports = {
  ...enums
}
