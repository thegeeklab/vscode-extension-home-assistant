/**
 * Binary Sensor integration
 * Source: https://github.com/home-assistant/core/blob/dev/homeassistant/components/binary_sensor/__init__.py
 */
import { IncludeList } from "../../types.js"
import { PlatformSchema } from "../platform.js"
import { BinarySensorPlatformSchema as GroupPlatformSchema } from "./group.js"
import { BinarySensorPlatformSchema as TemplatePlatformSchema } from "./template.js"
import { BinarySensorPlatformSchema as TodPlatformSchema } from "./tod.js"

export type Domain = "binary_sensor"
export type Schema = Item[] | IncludeList
export type File = Item | Item[]

/**
 * @TJS-additionalProperties true
 */

interface OtherPlatform extends PlatformSchema {
  /**
   * @TJS-pattern ^(?!(group|template|tod|mqtt)$)\w+$
   */
  platform: string
}

type Item = GroupPlatformSchema | TemplatePlatformSchema | TodPlatformSchema | OtherPlatform
