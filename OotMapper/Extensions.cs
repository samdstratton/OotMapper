using System.Windows;
using OotMapper.Types;

namespace OotMapper
{
	public static class Extensions
	{
		public static Coord AsCoord(this Size size) {
			return new Coord(size.Width, size.Height);
		}

		public static Coord AsCoord(this Point pt) {
			return new Coord(pt.X, pt.Y);
		}
	}
}
