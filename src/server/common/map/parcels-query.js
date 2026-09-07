import Joi from 'joi'

const ACTION_CODE_MAX_LENGTH = 50

export const parcelsQuery = {
  query: Joi.object({
    enabledLandActions: Joi.array()
      .items(Joi.string().trim().min(1).max(ACTION_CODE_MAX_LENGTH))
      .single()
      .max(100)
      .default([])
  })
}
