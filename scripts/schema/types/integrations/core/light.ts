/**
 * Light integration
 * Source: https://github.com/home-assistant/core/blob/dev/homeassistant/components/light/__init__.py
 */
import { IncludeList } from "../../types.js"
import { PlatformSchema } from "../platform.js"
import { LightPlatformSchema as GroupPlatformSchema } from "./group.js"
import { LightPlatformSchema as TemplatePlatformSchema } from "./template.js"

export type Domain = "light"
export type Schema = Item[] | IncludeList
export type File = Item | Item[]

/**
 * @TJS-additionalProperties true
 */
interface OtherPlatform extends PlatformSchema {
  /**
   * @TJS-pattern ^(?!(group|template|mqtt)$)\w+$
   */
  platform: string
}

type Item = GroupPlatformSchema | TemplatePlatformSchema | OtherPlatform
