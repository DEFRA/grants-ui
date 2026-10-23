import Joi from 'joi'
import { COMPOUND_PARCEL_ID_PATTERN } from '~/src/shared/format-parcel.js'

const ACTION_CODE_MAX_LENGTH = 50
// Far above any reference. Longer input is truncated, not rejected, so nothing
// the search box can send gets a 400; the only answers are matches or none.
const SEARCH_MAX_LENGTH = 100
// What the search plugin lets through; odd input gets "no matches", not a 400.
const SEARCH_PATTERN = /^[A-Za-z0-9\s\-.,]+$/

export const parcelsQuery = {
  query: Joi.object({
    enabledLandActions: Joi.array()
      .items(Joi.string().trim().min(1).max(ACTION_CODE_MAX_LENGTH))
      .single()
      .max(100)
      .default([])
  })
}

export const parcelSearchQuery = {
  query: Joi.object({
    q: Joi.string().trim().min(1).max(SEARCH_MAX_LENGTH).truncate().pattern(SEARCH_PATTERN).required()
  })
}

export const parcelBboxParams = {
  params: Joi.object({
    parcelId: Joi.string().pattern(COMPOUND_PARCEL_ID_PATTERN).required()
  })
}
