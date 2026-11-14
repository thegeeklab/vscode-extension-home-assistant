/**
 * Sensor integration
 * Source: https://github.com/home-assistant/core/blob/dev/homeassistant/components/sensor/__init__.py
 */
import { IncludeList } from "../../types.js"
import { PlatformSchema } from "../platform.js"
import { SensorPlatformSchema as GroupPlatformSchema } from "./group.js"
import { SensorPlatformSchema as TemplatePlatformSchema } from "./template.js"
import { SensorPlatformSchema as MQTTRoomPlatformSchema } from "./mqtt_room.js"

export type Domain = "sensor"
export type Schema = Item[] | IncludeList
export type File = Item | Item[]

/**
 * @TJS-additionalProperties true
 */
interface OtherPlatform extends PlatformSchema {
  /**
   * @TJS-pattern ^(?!(group|mqtt_room|template|mqtt)$)\w+$
   */
  platform: string
}

type Item = GroupPlatformSchema | MQTTRoomPlatformSchema | TemplatePlatformSchema | OtherPlatform
