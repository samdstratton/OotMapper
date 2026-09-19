using System.Windows;
using Newtonsoft.Json;

namespace OotMapper.Types
{
	public class Coord
	{
		[JsonRequired]
		public double X { get; set; }
		[JsonRequired]
		public double Y { get; set; }

		public Coord(double x, double y) {
			X = x;
			Y = y;
		}

		public static Coord FromPoint(Point p) {
			return new Coord(p.X, p.Y);
		}

		public override bool Equals(object obj) {
			if (obj is Coord other) {
				return X == other.X && Y == other.Y;
			}
			return false;
		}

		public override int GetHashCode() {
			int hashCode = 1861411795;
			hashCode=hashCode*-1521134295+X.GetHashCode();
			hashCode=hashCode*-1521134295+Y.GetHashCode();
			return hashCode;
		}

		public static Coord operator +(Coord a, Coord b) {
			return new Coord(a.X + b.X, a.Y + b.Y);
		}

		public static Coord operator -(Coord a, Coord b) {
			return new Coord(a.X - b.X, a.Y - b.Y);
		}

		public static Coord operator *(Coord a, Coord b) {
			return new Coord(a.X * b.X, a.Y * b.Y);
		}

		public static Coord operator /(Coord a, Coord b) {
			return new Coord(a.X / b.X, a.Y / b.Y);
		}

		public static Coord operator +(Coord a, double b) {
			return new Coord(a.X + b, a.Y + b);
		}

		public static Coord operator -(Coord a, double b) {
			return new Coord(a.X - b, a.Y - b);
		}

		public static Coord operator *(Coord a, double b) {
			return new Coord(a.X * b, a.Y * b);
		}

		public static Coord operator /(Coord a, double b) {
			return new Coord(a.X / b, a.Y / b);
		}
	}
}
