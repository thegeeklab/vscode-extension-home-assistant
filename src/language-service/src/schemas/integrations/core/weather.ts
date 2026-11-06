/**
 * Weather integration
 * Source: https://github.com/home-assistant/core/blob/dev/homeassistant/components/weather/__init__.py
 */
import { IncludeList } from "../../types.js"
import { PlatformSchema } from "../platform.js"
import { WeatherPlatformSchema as TemplatePlatformSchema } from "./template.js"

export type Domain = "weather"
export type Schema = Item[] | IncludeList
export type File = Item | Item[]

/**
 * @TJS-additionalProperties true
 */
interface OtherPlatform extends PlatformSchema {
  /**
   * @TJS-pattern ^(?!(template)$)\w+$
   */
  platform: string
}

type Item = TemplatePlatformSchema | OtherPlatform
