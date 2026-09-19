namespace OotMapper.Model
{
	public enum EntranceType
	{
		Outdoor = 0,
		Owl = 1,
		Indoor = 2,
		Grotto = 3,
		Dungeon = 4,
		__MAX_VALUE__ = 5
	}

	public static class EntranceTypeUtil
	{
		public static bool IsExterior(EntranceType enType) {
			return (enType == EntranceType.Outdoor || enType == EntranceType.Owl);
		}
	}
}
