/**
 * Cover integration
 * Source: https://github.com/home-assistant/core/blob/dev/homeassistant/components/cover/__init__.py
 */
import { IncludeList } from "../../types.js"
import { PlatformSchema } from "../platform.js"
import { CoverPlatformSchema as GroupPlatformSchema } from "./group.js"
import { CoverPlatformSchema as TemplatePlatformSchema } from "./template.js"

export type Domain = "cover"
export type Schema = Item[] | IncludeList
export type File = Item | Item[]

/**
 * @TJS-additionalProperties true
 */
interface OtherPlatform extends PlatformSchema {
  /**
   * @TJS-pattern ^(?!(group|template)$)\w+$
   */
  platform: string
}

type Item = GroupPlatformSchema | TemplatePlatformSchema | OtherPlatform
